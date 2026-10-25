#![no_std]

mod errors;
mod events;
mod types;

pub use errors::LatchError;
pub use types::{Hold, HoldStatus, HoldVerification};

use events::{BalanceSynced, Deposited, HoldCaptured, HoldCreated, HoldVoided, Initialized, Paid};
use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    token::TokenClient,
    Address, Bytes, BytesN, Env, Map, MuxedAddress, Symbol, TryFromVal, Vec,
};
use types::DataKey;

const MAX_ACTIVE_HOLDS: u32 = 16;
const MAX_STORED_HOLDS: u32 = 64;
const MAX_HOLD_LEDGERS: u32 = 120_960;
const INSTANCE_TTL_THRESHOLD: u32 = 518_400;
const INSTANCE_TTL_EXTEND_TO: u32 = 2_073_600;
const SIGNED_MESSAGE_PREFIX: &[u8] = b"Stellar Signed Message:\nLATCH authorization\nPayload: ";
const HEX: &[u8; 16] = b"0123456789abcdef";

#[contract]
pub struct Latch;

#[contractimpl]
impl Latch {
    pub fn __constructor(env: Env, owner: BytesN<32>, token: Address) {
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage()
            .instance()
            .set(&DataKey::MirrorBalance, &0_i128);
        env.storage()
            .instance()
            .set(&DataKey::Holds, &Map::<u64, Hold>::new(&env));
        env.storage().instance().set(&DataKey::NextHoldId, &1_u64);
        bump_ttl(&env);
        Initialized { owner, token }.publish(&env);
    }

    pub fn owner(env: Env) -> BytesN<32> {
        owner(&env)
    }

    pub fn token(env: Env) -> Address {
        token(&env)
    }

    pub fn mirror_balance(env: Env) -> i128 {
        mirror_balance(&env)
    }

    pub fn real_balance(env: Env) -> i128 {
        real_balance(&env)
    }

    pub fn total_reserved(env: Env) -> Result<i128, LatchError> {
        total_reserved_at(&env, env.ledger().sequence())
    }

    pub fn available(env: Env) -> Result<i128, LatchError> {
        effective_available(&env)
    }

    pub fn get_hold(env: Env, id: u64) -> Result<Hold, LatchError> {
        let mut hold = holds(&env).get(id).ok_or(LatchError::HoldNotFound)?;
        if hold.status == HoldStatus::Active && env.ledger().sequence() > hold.expires_at {
            hold.status = HoldStatus::Expired;
        }
        Ok(hold)
    }

    pub fn verify_hold(env: Env, id: u64) -> Result<HoldVerification, LatchError> {
        let hold = Self::get_hold(env.clone(), id)?;
        let active = hold.status == HoldStatus::Active;
        let reserved = total_reserved_at(&env, env.ledger().sequence())?;
        let backing = core::cmp::min(mirror_balance(&env), real_balance(&env));
        Ok(HoldVerification {
            active,
            guaranteed: active && backing >= reserved,
            merchant: hold.merchant,
            maximum: hold.maximum,
            expires_at: hold.expires_at,
            reference: hold.reference,
        })
    }

    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), LatchError> {
        positive(amount)?;
        from.require_auth();

        TokenClient::new(&env, &token(&env)).transfer(
            &from,
            MuxedAddress::from(env.current_contract_address()),
            &amount,
        );
        let next = mirror_balance(&env)
            .checked_add(amount)
            .ok_or(LatchError::ArithmeticOverflow)?;
        set_mirror_balance(&env, next);
        bump_ttl(&env);
        Deposited {
            from,
            amount,
            new_mirror: next,
        }
        .publish(&env);
        Ok(())
    }

    pub fn pay(env: Env, to: MuxedAddress, amount: i128) -> Result<(), LatchError> {
        positive(amount)?;
        env.current_contract_address().require_auth();
        let available = effective_available(&env)?;
        if amount > available {
            return Err(LatchError::ReservedBalanceViolation);
        }
        let new_available = available
            .checked_sub(amount)
            .ok_or(LatchError::ArithmeticOverflow)?;

        let next = mirror_balance(&env)
            .checked_sub(amount)
            .ok_or(LatchError::ArithmeticOverflow)?;
        set_mirror_balance(&env, next);
        TokenClient::new(&env, &token(&env)).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );
        bump_ttl(&env);
        Paid {
            to,
            amount,
            new_available,
        }
        .publish(&env);
        Ok(())
    }

    pub fn create_hold(
        env: Env,
        merchant: Address,
        maximum: i128,
        expires_at: u32,
        reference: BytesN<32>,
    ) -> Result<u64, LatchError> {
        positive(maximum)?;
        env.current_contract_address().require_auth();

        let now = env.ledger().sequence();
        if expires_at <= now {
            return Err(LatchError::InvalidExpiration);
        }
        if expires_at - now > MAX_HOLD_LEDGERS {
            return Err(LatchError::HoldDurationTooLong);
        }
        let mut current_holds = holds(&env);
        compact_holds(&env, &mut current_holds, now);
        if active_hold_count(&current_holds, now) >= MAX_ACTIVE_HOLDS {
            return Err(LatchError::TooManyHolds);
        }
        if current_holds.len() >= MAX_STORED_HOLDS {
            return Err(LatchError::TooManyHolds);
        }
        if maximum > effective_available(&env)? {
            return Err(LatchError::InsufficientAvailable);
        }

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextHoldId)
            .unwrap_or(1);
        let next_id = id.checked_add(1).ok_or(LatchError::ArithmeticOverflow)?;
        let hold = Hold {
            id,
            merchant: merchant.clone(),
            maximum,
            expires_at,
            reference,
            status: HoldStatus::Active,
            captured_amount: 0,
        };
        current_holds.set(id, hold);
        env.storage()
            .instance()
            .set(&DataKey::Holds, &current_holds);
        env.storage().instance().set(&DataKey::NextHoldId, &next_id);
        bump_ttl(&env);
        HoldCreated {
            id,
            merchant,
            maximum,
            expires_at,
        }
        .publish(&env);
        Ok(id)
    }

    pub fn capture(env: Env, id: u64, amount: i128) -> Result<(), LatchError> {
        non_negative(amount)?;
        let mut current_holds = holds(&env);
        let mut hold = current_holds.get(id).ok_or(LatchError::HoldNotFound)?;
        hold.merchant.require_auth();
        require_live(&env, &hold)?;
        if amount > hold.maximum {
            return Err(LatchError::ExceedsHoldMaximum);
        }
        if amount > 0 {
            let reserved = total_reserved_at(&env, env.ledger().sequence())?;
            let reserved_for_others = reserved
                .checked_sub(hold.maximum)
                .ok_or(LatchError::ArithmeticOverflow)?;
            let backing = core::cmp::min(mirror_balance(&env), real_balance(&env));
            let remaining_backing = backing
                .checked_sub(amount)
                .ok_or(LatchError::BalanceBackingLost)?;
            if remaining_backing < reserved_for_others {
                return Err(LatchError::BalanceBackingLost);
            }
            let next = mirror_balance(&env)
                .checked_sub(amount)
                .ok_or(LatchError::BalanceBackingLost)?;
            set_mirror_balance(&env, next);
            TokenClient::new(&env, &token(&env)).transfer(
                &env.current_contract_address(),
                MuxedAddress::from(hold.merchant.clone()),
                &amount,
            );
        }
        hold.captured_amount = amount;
        hold.status = HoldStatus::Captured;
        current_holds.set(id, hold.clone());
        env.storage()
            .instance()
            .set(&DataKey::Holds, &current_holds);
        bump_ttl(&env);
        HoldCaptured {
            id,
            merchant: hold.merchant,
            amount,
            released: hold
                .maximum
                .checked_sub(amount)
                .ok_or(LatchError::ArithmeticOverflow)?,
        }
        .publish(&env);
        Ok(())
    }

    pub fn void(env: Env, id: u64) -> Result<(), LatchError> {
        let mut current_holds = holds(&env);
        let mut hold = current_holds.get(id).ok_or(LatchError::HoldNotFound)?;
        hold.merchant.require_auth();
        require_live(&env, &hold)?;
        hold.status = HoldStatus::Voided;
        current_holds.set(id, hold.clone());
        env.storage()
            .instance()
            .set(&DataKey::Holds, &current_holds);
        bump_ttl(&env);
        HoldVoided {
            id,
            merchant: hold.merchant,
        }
        .publish(&env);
        Ok(())
    }

    pub fn sync(env: Env) -> i128 {
        let old_mirror = mirror_balance(&env);
        let balance = real_balance(&env);
        set_mirror_balance(&env, balance);
        bump_ttl(&env);
        BalanceSynced {
            old_mirror,
            new_mirror: balance,
        }
        .publish(&env);
        balance
    }
}

#[contractimpl]
impl CustomAccountInterface for Latch {
    type Signature = BytesN<64>;
    type Error = LatchError;

    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signature: BytesN<64>,
        auth_contexts: Vec<Context>,
    ) -> Result<(), LatchError> {
        // SDK 27 rejects an invalid Ed25519 signature with a host error. It does
        // not return a contract error, so this call intentionally runs first.
        // Freighter intentionally refuses to sign a CAP-71 auth preimage for
        // a C-address while the active wallet is the owner G-address. Ask it
        // to sign the same auth payload through SEP-53 instead, then recreate
        // that digest here. The Soroban payload still binds the network,
        // nonce, contract address, invocation, and expiration ledger.
        let message = owner_signature_digest(&env, &signature_payload);
        env.crypto()
            .ed25519_verify(&owner(&env), &Bytes::from(message), &signature);

        let self_address = env.current_contract_address();
        let token_address = token(&env);
        let mut requested_outflow = 0_i128;

        for context in auth_contexts.iter() {
            match context {
                Context::Contract(call) => {
                    if call.contract == self_address {
                        let pay = Symbol::new(&env, "pay");
                        let create_hold = Symbol::new(&env, "create_hold");
                        if call.fn_name == pay {
                            let amount = i128::try_from_val(
                                &env,
                                &call.args.get(1).ok_or(LatchError::ForbiddenOperation)?,
                            )
                            .map_err(|_| LatchError::ForbiddenOperation)?;
                            positive(amount)?;
                            requested_outflow = requested_outflow
                                .checked_add(amount)
                                .ok_or(LatchError::ArithmeticOverflow)?;
                        } else if call.fn_name != create_hold {
                            return Err(LatchError::ForbiddenSelfCall);
                        }
                    } else if call.contract == token_address {
                        return Err(LatchError::DirectTokenCallsDisabled);
                    } else {
                        return Err(LatchError::ForbiddenOperation);
                    }
                }
                Context::CreateContractHostFn(_) | Context::CreateContractWithCtorHostFn(_) => {
                    return Err(LatchError::ForbiddenOperation);
                }
            }
        }

        // __check_auth remains storage-only. The function body repeats this
        // guard using min(mirror, real SAC balance), which closes stale-mirror
        // and external-clawback races without token re-entry during auth.
        let reserved = total_reserved_at(&env, env.ledger().sequence())?;
        let mirror_available = mirror_balance(&env)
            .checked_sub(reserved)
            .ok_or(LatchError::ReservedBalanceViolation)?;
        if requested_outflow > mirror_available {
            return Err(LatchError::ReservedBalanceViolation);
        }
        Ok(())
    }
}

fn owner_signature_digest(env: &Env, payload: &Hash<32>) -> Hash<32> {
    let mut message = Bytes::from_slice(env, SIGNED_MESSAGE_PREFIX);
    for byte in Bytes::from(payload.clone()).iter() {
        message.push_back(HEX[(byte >> 4) as usize]);
        message.push_back(HEX[(byte & 0x0f) as usize]);
    }
    env.crypto().sha256(&message)
}

fn owner(env: &Env) -> BytesN<32> {
    env.storage().instance().get(&DataKey::Owner).unwrap()
}

fn token(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Token).unwrap()
}

fn holds(env: &Env) -> Map<u64, Hold> {
    env.storage()
        .instance()
        .get(&DataKey::Holds)
        .unwrap_or(Map::new(env))
}

fn mirror_balance(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::MirrorBalance)
        .unwrap_or(0)
}

fn set_mirror_balance(env: &Env, amount: i128) {
    env.storage()
        .instance()
        .set(&DataKey::MirrorBalance, &amount);
}

fn real_balance(env: &Env) -> i128 {
    TokenClient::new(env, &token(env)).balance(&env.current_contract_address())
}

fn total_reserved_at(env: &Env, sequence: u32) -> Result<i128, LatchError> {
    let mut total = 0_i128;
    for (_, hold) in holds(env).iter() {
        if hold.status == HoldStatus::Active && sequence <= hold.expires_at {
            total = total
                .checked_add(hold.maximum)
                .ok_or(LatchError::ArithmeticOverflow)?;
        }
    }
    Ok(total)
}

fn active_hold_count(current_holds: &Map<u64, Hold>, sequence: u32) -> u32 {
    let mut count = 0_u32;
    for (_, hold) in current_holds.iter() {
        if hold.status == HoldStatus::Active && sequence <= hold.expires_at {
            count += 1;
        }
    }
    count
}

fn compact_holds(env: &Env, current_holds: &mut Map<u64, Hold>, sequence: u32) {
    if current_holds.len() < MAX_STORED_HOLDS {
        return;
    }

    // Terminal history remains available through events. Once the bounded
    // instance map fills, retain only live reservations so reads stay cheap
    // and owner/merchant churn cannot grow contract state without limit.
    let mut live = Map::new(env);
    for (id, hold) in current_holds.iter() {
        if hold.status == HoldStatus::Active && sequence <= hold.expires_at {
            live.set(id, hold);
        }
    }
    *current_holds = live;
}

fn effective_available(env: &Env) -> Result<i128, LatchError> {
    let backing = core::cmp::min(mirror_balance(env), real_balance(env));
    let reserved = total_reserved_at(env, env.ledger().sequence())?;
    Ok(backing.checked_sub(reserved).unwrap_or(0).max(0))
}

fn require_live(env: &Env, hold: &Hold) -> Result<(), LatchError> {
    if hold.status != HoldStatus::Active {
        return Err(LatchError::HoldNotActive);
    }
    if env.ledger().sequence() > hold.expires_at {
        return Err(LatchError::HoldExpired);
    }
    Ok(())
}

fn positive(amount: i128) -> Result<(), LatchError> {
    if amount <= 0 {
        return Err(LatchError::InvalidAmount);
    }
    Ok(())
}

fn non_negative(amount: i128) -> Result<(), LatchError> {
    if amount < 0 {
        return Err(LatchError::InvalidAmount);
    }
    Ok(())
}

fn bump_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;

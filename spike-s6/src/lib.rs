#![no_std]

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl, contracttype, crypto::Hash,
    Address, Env, Symbol, TryFromVal, Val, Vec,
};

// ===== Mock SEP-41 token =====

#[contracttype]
#[derive(Clone)]
pub enum TokenKey {
    Admin,
    Balance(Address),
}

#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&TokenKey::Admin, &admin);
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&TokenKey::Admin).unwrap();
        admin.require_auth();
        let bal: i128 = env
            .storage()
            .instance()
            .get(&TokenKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&TokenKey::Balance(to.clone()), &(bal + amount));
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().instance().get(&TokenKey::Balance(id)).unwrap_or(0)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let from_bal: i128 = env
            .storage()
            .instance()
            .get(&TokenKey::Balance(from.clone()))
            .unwrap_or(0);
        assert!(from_bal >= amount, "insufficient balance");
        env.storage()
            .instance()
            .set(&TokenKey::Balance(from.clone()), &(from_bal - amount));
        let to_bal: i128 = env
            .storage()
            .instance()
            .get(&TokenKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&TokenKey::Balance(to.clone()), &(to_bal + amount));
    }
}

// ===== LATCH account: read-only __check_auth, mirror written in the body =====

#[contracttype]
#[derive(Clone)]
pub enum LatchKey {
    Token,
    Mirror,
    CheckAuthCount,
    LastContexts,
}

#[contracterror]
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u32)]
pub enum LatchError {
    ForbiddenOperation = 1,
    ForbiddenSelfCall = 2,
    DirectTokenCallsDisabled = 3,
    ReservedBalanceViolation = 4,
}

#[contract]
pub struct LatchRead;

#[contractimpl]
impl LatchRead {
    pub fn __constructor(env: Env, token: Address, mirror: i128) {
        env.storage().instance().set(&LatchKey::Token, &token);
        env.storage().instance().set(&LatchKey::Mirror, &mirror);
        env.storage().instance().set(&LatchKey::CheckAuthCount, &0u32);
    }

    pub fn mirror(env: Env) -> i128 {
        env.storage().instance().get(&LatchKey::Mirror).unwrap()
    }

    pub fn check_auth_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&LatchKey::CheckAuthCount)
            .unwrap_or(0)
    }

    pub fn last_contexts(env: Env) -> Vec<Context> {
        env.storage()
            .instance()
            .get(&LatchKey::LastContexts)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// THE only outflow path. `require_auth` triggers the read-only
    /// `__check_auth`, then the BODY writes the mirror and transfers.
    pub fn pay(env: Env, to: Address, amount: i128) {
        env.current_contract_address().require_auth();
        let token: Address = env.storage().instance().get(&LatchKey::Token).unwrap();
        let mirror: i128 = env.storage().instance().get(&LatchKey::Mirror).unwrap();
        assert!(amount <= mirror, "reserved balance violation");
        // BODY WRITE: this is what lands in the recording-mode footprint.
        env.storage()
            .instance()
            .set(&LatchKey::Mirror, &(mirror - amount));
        MockTokenClient::new(&env, &token).transfer(&env.current_contract_address(), &to, &amount);
    }

    pub fn create_hold(env: Env, merchant: Address, amount: i128) {
        env.current_contract_address().require_auth();
        // No token flow; reservation bookkeeping would live here.
        // Deliberately minimal for the spike.
        let _ = (merchant, amount);
    }
}

fn arg_i128(env: &Env, args: &Vec<Val>, idx: u32) -> i128 {
    i128::try_from_val(env, &args.get_unchecked(idx)).unwrap()
}

#[contractimpl]
impl CustomAccountInterface for LatchRead {
    type Signature = ();
    type Error = LatchError;

    #[allow(non_snake_case)]
    fn __check_auth(
        env: Env,
        _signature_payload: Hash<32>,
        _signatures: (),
        auth_contexts: Vec<Context>,
    ) -> Result<(), LatchError> {
        // Test-only recording.
        env.storage().instance().set(&LatchKey::LastContexts, &auth_contexts);
        let count: u32 = env
            .storage()
            .instance()
            .get(&LatchKey::CheckAuthCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&LatchKey::CheckAuthCount, &(count + 1));

        let self_addr = env.current_contract_address();
        let token: Address = env.storage().instance().get(&LatchKey::Token).unwrap();
        // READ ONLY.
        let mirror: i128 = env.storage().instance().get(&LatchKey::Mirror).unwrap();

        let pay = Symbol::new(&env, "pay");
        let create_hold = Symbol::new(&env, "create_hold");

        let mut outflow: i128 = 0;

        for ctx in auth_contexts.iter() {
            match ctx {
                Context::Contract(c) if c.contract == self_addr => {
                    if c.fn_name == pay {
                        outflow += arg_i128(&env, &c.args, 1);
                    } else if c.fn_name == create_hold {
                        // no token flow
                    } else {
                        return Err(LatchError::ForbiddenSelfCall);
                    }
                }
                // Direct token calls (transfer, approve, burn, ...) are ALL
                // disabled: the only outflow path is `pay`.
                Context::Contract(c) if c.contract == token => {
                    return Err(LatchError::DirectTokenCallsDisabled);
                }
                _ => return Err(LatchError::ForbiddenOperation),
            }
        }

        if outflow > mirror {
            return Err(LatchError::ReservedBalanceViolation);
        }
        // NO WRITE HERE.
        Ok(())
    }
}

// ===== Relay: intermediary for the double-spend test =====

#[contract]
pub struct Relay;

#[contractimpl]
impl Relay {
    pub fn pay_twice(
        env: Env,
        latch: Address,
        to1: Address,
        amount1: i128,
        to2: Address,
        amount2: i128,
    ) {
        LatchReadClient::new(&env, &latch).pay(&to1, &amount1);
        LatchReadClient::new(&env, &latch).pay(&to2, &amount2);
    }
}

#[cfg(test)]
mod test;

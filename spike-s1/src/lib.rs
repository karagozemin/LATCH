#![no_std]

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl, contracttype, crypto::Hash,
    Address, Env, Vec,
};

// ===== Mock SEP-41 token (mintable, for clean funding in tests) =====

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

// ===== LATCH-like contract account =====

#[contracttype]
#[derive(Clone)]
pub enum LatchKey {
    Token,
    CheckAuthCount,
    CheckAuthContexts,
}

#[contract]
pub struct LatchSpike;

#[contractimpl]
impl LatchSpike {
    pub fn __constructor(env: Env, token: Address) {
        env.storage().instance().set(&LatchKey::Token, &token);
        env.storage().instance().set(&LatchKey::CheckAuthCount, &0u32);
    }

    /// The S1 core: a self-transfer. Does this invoke `__check_auth`?
    pub fn capture(env: Env, merchant: Address, amount: i128) {
        let token: Address = env.storage().instance().get(&LatchKey::Token).unwrap();
        MockTokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &merchant,
            &amount,
        );
    }

    /// Requires auth on THIS account (triggers `__check_auth` once), then does
    /// a nested self-transfer. Probes whether the nested transfer also appears
    /// in `__check_auth`'s `auth_contexts` (double-count risk).
    pub fn pay(env: Env, to: Address, amount: i128) {
        env.current_contract_address().require_auth();
        let token: Address = env.storage().instance().get(&LatchKey::Token).unwrap();
        MockTokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );
    }

    pub fn check_auth_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&LatchKey::CheckAuthCount)
            .unwrap_or(0)
    }

    pub fn last_check_auth_contexts(env: Env) -> Vec<Context> {
        env.storage()
            .instance()
            .get(&LatchKey::CheckAuthContexts)
            .unwrap_or_else(|| Vec::new(&env))
    }
}

#[contractimpl]
impl CustomAccountInterface for LatchSpike {
    type Signature = ();
    type Error = soroban_sdk::Error;

    #[allow(non_snake_case)]
    fn __check_auth(
        env: Env,
        _signature_payload: Hash<32>,
        _signatures: (),
        auth_contexts: Vec<Context>,
    ) -> Result<(), soroban_sdk::Error> {
        // Record every invocation and exactly what contexts it saw.
        let count: u32 = env
            .storage()
            .instance()
            .get(&LatchKey::CheckAuthCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&LatchKey::CheckAuthCount, &(count + 1));
        env.storage()
            .instance()
            .set(&LatchKey::CheckAuthContexts, &auth_contexts);
        Ok(())
    }
}

#[cfg(test)]
mod test;

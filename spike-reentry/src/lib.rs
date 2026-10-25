#![no_std]

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl, contracttype, crypto::Hash,
    token, Address, Env, Vec,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Token,
    CallTokenInCheckAuth,
}

/// A throwaway account contract used to reproduce Soroban's reentrancy
/// prohibition: `__check_auth` (triggered by a SAC transfer) calls
/// `token.balance()` on the very SAC that is already on the call stack.
#[contract]
pub struct SpikeAccount;

#[contractimpl]
impl SpikeAccount {
    pub fn __constructor(env: Env, token: Address, call_token_in_check_auth: bool) {
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage()
            .instance()
            .set(&DataKey::CallTokenInCheckAuth, &call_token_in_check_auth);
    }
}

#[contractimpl]
impl CustomAccountInterface for SpikeAccount {
    // `Error` (instead of a custom contracterror) lets us propagate the
    // host's reentrancy error verbatim via `?` rather than re-mapping it.
    type Signature = ();
    type Error = soroban_sdk::Error;

    #[allow(non_snake_case)]
    fn __check_auth(
        env: Env,
        _signature_payload: Hash<32>,
        _signatures: (),
        _auth_contexts: Vec<Context>,
    ) -> Result<(), soroban_sdk::Error> {
        let call_token: bool = env
            .storage()
            .instance()
            .get(&DataKey::CallTokenInCheckAuth)
            .unwrap_or(false);

        if call_token {
            // ===== THE SPIKE =====
            // This __check_auth was invoked by a SAC `transfer` that is still
            // on the call stack. Calling back into the SAC here is a
            // Prohibited re-entry and must fail with
            // "Contract re-entry is not allowed".
            let token: Address = env
                .storage()
                .instance()
                .get(&DataKey::Token)
                .unwrap();
            // try_balance returns Result<i128, Result<Error, InvokeError>>;
            // the reentry failure surfaces as Ok(Error), which we propagate
            // verbatim so the host diagnostic ("Contract re-entry is not
            // allowed") is preserved.
            let _balance = token::Client::new(&env, &token)
                .try_balance(&env.current_contract_address())
                .map_err(|e| e.unwrap())?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod test;

#![cfg(test)]
extern crate std;

use soroban_sdk::xdr::{
    Int128Parts, InvokeContractArgs, ScAddress, ScVal, SorobanAddressCredentials,
    SorobanAuthorizationEntry, SorobanAuthorizedFunction, SorobanAuthorizedInvocation,
    SorobanCredentials, StringM, VecM,
};
use soroban_sdk::{testutils::Address as _, token, Address, Env, MuxedAddress};

use crate::SpikeAccount;

fn i128_to_scval(v: i128) -> ScVal {
    ScVal::I128(Int128Parts {
        hi: (v >> 64) as i64,
        lo: v as u64,
    })
}

/// Builds the auth entry a wallet/tool would attach to authorize a SAC
/// `transfer(from, to, amount)` on behalf of the `account` contract account.
fn transfer_auth_entry(
    account: &Address,
    sac: &Address,
    to: &Address,
    amount: i128,
) -> SorobanAuthorizationEntry {
    let account_sc: ScAddress = account.clone().try_into().unwrap();
    SorobanAuthorizationEntry {
        credentials: SorobanCredentials::Address(SorobanAddressCredentials {
            address: account_sc,
            nonce: 1,
            signature: ScVal::Void,
            signature_expiration_ledger: 100,
        }),
        root_invocation: SorobanAuthorizedInvocation {
            function: SorobanAuthorizedFunction::ContractFn(InvokeContractArgs {
                contract_address: sac.clone().try_into().unwrap(),
                function_name: StringM::try_from("transfer").unwrap().into(),
                args: std::vec![
                    ScVal::from(account.clone()),
                    ScVal::from(MuxedAddress::from(to.clone())),
                    i128_to_scval(amount),
                ]
                .try_into()
                .unwrap(),
            }),
            sub_invocations: VecM::default(),
        },
    }
}

fn host_diagnostics(env: &Env) -> std::vec::Vec<std::string::String> {
    env.host()
        .get_diagnostic_events()
        .unwrap()
        .0
        .iter()
        .map(|e| std::format!("{:?}", e))
        .collect()
}

/// THE SPIKE: a SAC transfer whose source is a contract account whose
/// `__check_auth` calls `token.balance()` — this re-enters the SAC while the
/// SAC `transfer` is still on the call stack.
#[test]
fn sac_transfer_reverts_when_check_auth_calls_token_balance() {
    let env = Env::default();

    let sac_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(sac_admin).address();
    let token_client = token::Client::new(&env, &sac);

    // Deploy the account contract. Its address IS the account (contract account).
    let account = env.register(SpikeAccount, (&sac, true));

    let recipient = Address::generate(&env);

    env.set_auths(&[transfer_auth_entry(&account, &sac, &recipient, 1)]);

    let res = token_client.try_transfer(&account, &MuxedAddress::from(recipient), &1_i128);

    assert!(res.is_err(), "expected the transfer to revert");
    // The host error type/code is Context/InvalidAction.
    let err_str = std::format!("{:?}", res);
    assert!(
        err_str.contains("InvalidAction"),
        "expected Error(Context, InvalidAction), got: {err_str}"
    );

    // The decisive proof: the host diagnostic carries the exact message.
    let diagnostics = host_diagnostics(&env);
    assert!(
        diagnostics
            .iter()
            .any(|l| l.contains("Contract re-entry is not allowed")),
        "expected reentry diagnostic; got diagnostics:\n{}",
        diagnostics.join("\n")
    );
}

/// CONTROL: identical setup, but `__check_auth` does NOT touch the token.
/// The transfer must NOT produce the reentrancy error (it gets past auth and
/// fails later, on the trustline/balance step, with a different error).
#[test]
fn control_no_reentry_when_check_auth_does_not_touch_token() {
    let env = Env::default();

    let sac_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(sac_admin).address();
    let token_client = token::Client::new(&env, &sac);

    let account = env.register(SpikeAccount, (&sac, false));

    let recipient = Address::generate(&env);

    env.set_auths(&[transfer_auth_entry(&account, &sac, &recipient, 1)]);

    let res = token_client.try_transfer(&account, &MuxedAddress::from(recipient), &1_i128);

    assert!(res.is_err(), "expected the transfer to fail (no trustline/balance)");
    let err_str = std::format!("{:?}", res);
    assert!(
        !err_str.contains("InvalidAction"),
        "expected a NON-reentrancy error, got: {err_str}"
    );

    let diagnostics = host_diagnostics(&env);
    assert!(
        !diagnostics
            .iter()
            .any(|l| l.contains("Contract re-entry is not allowed")),
        "control case must not trigger reentrancy; diagnostics:\n{}",
        diagnostics.join("\n")
    );
}

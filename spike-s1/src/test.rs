#![cfg(test)]
extern crate std;

use soroban_sdk::xdr::{
    Int128Parts, InvokeContractArgs, ScVal, SorobanAddressCredentials,
    SorobanAuthorizationEntry, SorobanAuthorizedFunction, SorobanAuthorizedInvocation,
    SorobanCredentials, StringM, VecM,
};
use soroban_sdk::{auth::Context, symbol_short, testutils::Address as _, Address, Env};

use crate::{LatchSpike, LatchSpikeClient, MockToken, MockTokenClient, TokenKey};

fn i128_to_scval(v: i128) -> ScVal {
    ScVal::I128(Int128Parts {
        hi: (v >> 64) as i64,
        lo: v as u64,
    })
}

/// Funds a token balance directly (no auth), so we never mask the result with
/// `mock_all_auths`.
fn fund(env: &Env, token: &Address, to: &Address, amount: i128) {
    env.as_contract(token, || {
        let bal: i128 = env
            .storage()
            .instance()
            .get(&TokenKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&TokenKey::Balance(to.clone()), &(bal + amount));
    });
}

/// Auth entry authorizing LATCH's own `pay(to, amount)` call (contract account).
fn pay_auth_entry(latch: &Address, to: &Address, amount: i128) -> SorobanAuthorizationEntry {
    SorobanAuthorizationEntry {
        credentials: SorobanCredentials::Address(SorobanAddressCredentials {
            address: latch.clone().try_into().unwrap(),
            nonce: 1,
            signature: ScVal::Void,
            signature_expiration_ledger: 100,
        }),
        root_invocation: SorobanAuthorizedInvocation {
            function: SorobanAuthorizedFunction::ContractFn(InvokeContractArgs {
                contract_address: latch.clone().try_into().unwrap(),
                function_name: StringM::try_from("pay").unwrap().into(),
                args: std::vec![ScVal::from(to.clone()), i128_to_scval(amount)]
                    .try_into()
                    .unwrap(),
            }),
            sub_invocations: VecM::default(),
        },
    }
}

/// S1 core: `capture` does a self-transfer. It must NOT invoke `__check_auth`
/// (the transfer is authorized as invoker-contract, i.e. the current contract
/// authorizing its own address).
#[test]
fn s1_capture_self_transfer_does_not_invoke_check_auth() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env.register(MockToken, (&admin,));
    let token_client = MockTokenClient::new(&env, &token);
    let latch = env.register(LatchSpike, (&token,));
    let latch_client = LatchSpikeClient::new(&env, &latch);

    fund(&env, &token, &latch, 1000);

    let merchant = Address::generate(&env);
    latch_client.capture(&merchant, &8_i128);

    assert_eq!(token_client.balance(&merchant), 8);
    assert_eq!(token_client.balance(&latch), 992);
    // THE S1 ANSWER: __check_auth was never invoked.
    assert_eq!(latch_client.check_auth_count(), 0);
}

/// S1 secondary: when `pay` triggers `__check_auth`, the nested self-transfer
/// must NOT also appear in `auth_contexts` (it's invoker-contract auth, a
/// sub-invocation). Otherwise the amount is double-counted.
#[test]
fn s1_pay_nested_self_transfer_does_not_double_count() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env.register(MockToken, (&admin,));
    let token_client = MockTokenClient::new(&env, &token);
    let latch = env.register(LatchSpike, (&token,));
    let latch_client = LatchSpikeClient::new(&env, &latch);

    fund(&env, &token, &latch, 1000);

    let to = Address::generate(&env);
    env.set_auths(&[pay_auth_entry(&latch, &to, 8_i128)]);

    latch_client.pay(&to, &8_i128);

    assert_eq!(token_client.balance(&to), 8);
    assert_eq!(token_client.balance(&latch), 992);

    // __check_auth ran exactly ONCE — for the `pay` call itself.
    assert_eq!(latch_client.check_auth_count(), 1);

    // And it saw exactly ONE context: `pay`. The nested self-transfer is
    // invoker-contract auth and does NOT appear → no double-count.
    let ctxs = latch_client.last_check_auth_contexts();
    assert_eq!(ctxs.len(), 1, "contexts: {ctxs:?}");
    match ctxs.first() {
        Some(Context::Contract(c)) => {
            assert_eq!(c.fn_name, symbol_short!("pay"));
        }
        other => panic!("expected a single Contract(pay) context, got {other:?}"),
    }
}

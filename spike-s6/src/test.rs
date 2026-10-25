#![cfg(test)]
extern crate std;
use std::println;

use soroban_sdk::xdr::{
    Int128Parts, InvokeContractArgs, ScVal, SorobanAddressCredentials,
    SorobanAuthorizationEntry, SorobanAuthorizedFunction, SorobanAuthorizedInvocation,
    SorobanCredentials, StringM, VecM,
};
use soroban_sdk::{
    auth::{Context, ContractContext},
    testutils::Address as _,
    vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
};

use crate::{
    LatchError, LatchRead, LatchReadClient, MockToken, MockTokenClient, Relay, RelayClient, TokenKey,
};

fn i128_to_scval(v: i128) -> ScVal {
    ScVal::I128(Int128Parts {
        hi: (v >> 64) as i64,
        lo: v as u64,
    })
}

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

fn pay_auth_entry(latch: &Address, to: &Address, amount: i128, nonce: i64) -> SorobanAuthorizationEntry {
    SorobanAuthorizationEntry {
        credentials: SorobanCredentials::Address(SorobanAddressCredentials {
            address: latch.clone().try_into().unwrap(),
            nonce,
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

/// S6a: the mirror write lives in `pay()`'s BODY, not `__check_auth`. In
/// RECORDING mode (what simulateTransaction uses), `__check_auth` is skipped
/// but the body runs — so the mirror write IS captured in the footprint.
#[test]
fn s6a_pay_body_writes_mirror_in_recording_mode() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env.register(MockToken, (&admin,));
    let token_client = MockTokenClient::new(&env, &token);
    let latch = env.register(LatchRead, (&token, 1000_i128));
    let latch_client = LatchReadClient::new(&env, &latch);
    fund(&env, &token, &latch, 1000);

    env.mock_all_auths(); // == recording mode (what simulation does)

    let to = Address::generate(&env);
    latch_client.pay(&to, &50_i128);

    println!(
        "S6a RECORDING: __check_auth count = {}, mirror = {}",
        latch_client.check_auth_count(),
        latch_client.mirror()
    );
    // __check_auth skipped (recording), but the BODY wrote the mirror.
    assert_eq!(latch_client.check_auth_count(), 0);
    assert_eq!(
        latch_client.mirror(),
        950,
        "body must write the mirror in recording mode (so it enters the footprint)"
    );
    assert_eq!(token_client.balance(&to), 50);
}

/// S6c: a direct token-call context must be rejected with
/// `DirectTokenCallsDisabled` at the `__check_auth` boundary.
#[test]
fn s6c_token_context_is_directly_disabled() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env.register(MockToken, (&admin,));
    let latch = env.register(LatchRead, (&token, 1000_i128));

    let to = Address::generate(&env);
    let transfer_ctx = Context::Contract(ContractContext {
        contract: token.clone(),
        fn_name: Symbol::new(&env, "transfer"),
        args: Vec::from_array(&env, [
            latch.clone().to_val(),
            to.clone().to_val(),
            5_i128.into_val(&env),
        ]),
    });

    let res = env.try_invoke_contract_check_auth::<LatchError>(
        &latch,
        &BytesN::from_array(&env, &[0; 32]),
        ().into(),
        &vec![&env, transfer_ctx],
    );
    println!("S6c token-context __check_auth result: {res:?}");
    assert_eq!(
        res,
        Err(Ok(LatchError::DirectTokenCallsDisabled)),
        "token context must be disabled entirely"
    );
}

/// S6d: with mirror = 8, two $5 `pay` calls in one tx — the SECOND must see
/// the FIRST's body-written mirror and reject. Double-spend blocked.
#[test]
fn s6d_two_pays_second_sees_body_written_mirror() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env.register(MockToken, (&admin,));
    let token_client = MockTokenClient::new(&env, &token);
    let latch = env.register(LatchRead, (&token, 8_i128));
    let latch_client = LatchReadClient::new(&env, &latch);
    let relay = env.register(Relay, ());
    let relay_client = RelayClient::new(&env, &relay);
    fund(&env, &token, &latch, 1000);

    let to1 = Address::generate(&env);
    let to2 = Address::generate(&env);

    env.set_auths(&[
        pay_auth_entry(&latch, &to1, 5, 1),
        pay_auth_entry(&latch, &to2, 5, 2),
    ]);

    let res = relay_client.try_pay_twice(&latch, &to1, &5_i128, &to2, &5_i128);
    println!("S6d relay.pay_twice (mirror=8, two $5) result: {res:?}");

    assert!(res.is_err(), "double-spend must be blocked");
    // Whole tx reverted.
    assert_eq!(token_client.balance(&latch), 1000);
    assert_eq!(latch_client.mirror(), 8);
}

#![cfg(test)]
extern crate std;
use std::println;

use soroban_sdk::xdr::{
    Int128Parts, InvokeContractArgs, ScVal, SorobanAddressCredentials,
    SorobanAuthorizationEntry, SorobanAuthorizedFunction, SorobanAuthorizedInvocation,
    SorobanCredentials, StringM, VecM,
};
use soroban_sdk::{auth::Context, testutils::Address as _, Address, Env, Vec};

use crate::{LatchDeny, LatchDenyClient, MockToken, MockTokenClient, Relay, RelayClient, TokenKey};

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

fn transfer_invocation(
    token: &Address,
    latch: &Address,
    to: &Address,
    amount: i128,
) -> SorobanAuthorizedInvocation {
    SorobanAuthorizedInvocation {
        function: SorobanAuthorizedFunction::ContractFn(InvokeContractArgs {
            contract_address: token.clone().try_into().unwrap(),
            function_name: StringM::try_from("transfer").unwrap().into(),
            args: std::vec![
                ScVal::from(latch.clone()),
                ScVal::from(to.clone()),
                i128_to_scval(amount),
            ]
            .try_into()
            .unwrap(),
        }),
        sub_invocations: VecM::default(),
    }
}

fn entry(
    latch: &Address,
    root: SorobanAuthorizedInvocation,
    nonce: i64,
) -> SorobanAuthorizationEntry {
    SorobanAuthorizationEntry {
        credentials: SorobanCredentials::Address(SorobanAddressCredentials {
            address: latch.clone().try_into().unwrap(),
            nonce,
            signature: ScVal::Void,
            signature_expiration_ledger: 100,
        }),
        root_invocation: root,
    }
}

fn transfer_entry(
    latch: &Address,
    token: &Address,
    to: &Address,
    amount: i128,
    nonce: i64,
) -> SorobanAuthorizationEntry {
    entry(latch, transfer_invocation(token, latch, to, amount), nonce)
}

/// ONE auth entry whose tree is: root = transfer#1, sub = transfer#2.
fn two_transfer_tree_entry(
    latch: &Address,
    token: &Address,
    to1: &Address,
    a1: i128,
    to2: &Address,
    a2: i128,
) -> SorobanAuthorizationEntry {
    let mut root = transfer_invocation(token, latch, to1, a1);
    root.sub_invocations = VecM::try_from(std::vec![transfer_invocation(token, latch, to2, a2)])
        .unwrap();
    entry(latch, root, 1)
}

fn print_contexts(label: &str, ctxs: &Vec<Context>) {
    println!("=== {label} ===");
    println!("Vec<Context> len = {}", ctxs.len());
    for (i, ctx) in ctxs.iter().enumerate() {
        match ctx {
            Context::Contract(c) => println!(
                "  [{i}] Contract {{ contract = {:?}, fn_name = {:?} }}",
                c.contract, c.fn_name
            ),
            other => println!("  [{i}] {other:?}"),
        }
    }
}

/// S3-0 (shape): TWO sibling transfers can NOT be authorized by ONE tree
/// entry — the host requires a separate entry per sibling invocation.
#[test]
fn s30_single_tree_entry_second_sibling_rejected() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env.register(MockToken, (&admin,));
    let token_client = MockTokenClient::new(&env, &token);
    let latch = env.register(LatchDeny, (&token, 1000_i128));
    let relay = env.register(Relay, ());
    let relay_client = RelayClient::new(&env, &relay);

    fund(&env, &token, &latch, 1000);

    let to1 = Address::generate(&env);
    let to2 = Address::generate(&env);

    env.set_auths(&[two_transfer_tree_entry(&latch, &token, &to1, 5, &to2, 5)]);

    let res = relay_client.try_forward_twice(&token, &latch, &to1, &5_i128, &to2, &5_i128);
    println!("forward_twice (single tree entry) result: {res:?}");

    assert!(res.is_err(), "a single tree entry must NOT authorize two siblings");
    assert_eq!(token_client.balance(&latch), 1000);
}

/// S3-0: two sibling transfers authorized by TWO entries → `__check_auth` runs
/// TWICE, each seeing exactly one context. Mirror written by total outflow.
#[test]
fn s30_two_sibling_entries_are_two_check_auth_calls() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env.register(MockToken, (&admin,));
    let token_client = MockTokenClient::new(&env, &token);
    let latch = env.register(LatchDeny, (&token, 1000_i128));
    let latch_client = LatchDenyClient::new(&env, &latch);
    let relay = env.register(Relay, ());
    let relay_client = RelayClient::new(&env, &relay);

    fund(&env, &token, &latch, 1000);

    let to1 = Address::generate(&env);
    let to2 = Address::generate(&env);

    env.set_auths(&[
        transfer_entry(&latch, &token, &to1, 5, 1),
        transfer_entry(&latch, &token, &to2, 5, 2),
    ]);

    let res = relay_client.try_forward_twice(&token, &latch, &to1, &5_i128, &to2, &5_i128);
    println!("forward_twice (two entries) result: {res:?}");
    assert!(res.is_ok(), "two sibling entries should authorize two transfers");

    assert_eq!(token_client.balance(&to1), 5);
    assert_eq!(token_client.balance(&to2), 5);
    assert_eq!(token_client.balance(&latch), 990);

    // Two __check_auth calls, not one.
    assert_eq!(latch_client.check_auth_count(), 2);

    // Mirror decremented by the TOTAL outflow (5 + 5).
    assert_eq!(latch_client.mirror(), 990);

    let ctxs = latch_client.last_contexts();
    print_contexts("S3-0 last __check_auth contexts (two entries)", &ctxs);
    assert_eq!(ctxs.len(), 1);
}

/// S3a: with mirror = 8 and two $5 transfers, the SECOND `__check_auth` must
/// see the FIRST's mirror decrement → double-spend blocked.
#[test]
fn s3a_second_check_auth_sees_first_decrement() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env.register(MockToken, (&admin,));
    let token_client = MockTokenClient::new(&env, &token);
    let latch = env.register(LatchDeny, (&token, 8_i128));
    let latch_client = LatchDenyClient::new(&env, &latch);
    let relay = env.register(Relay, ());
    let relay_client = RelayClient::new(&env, &relay);

    fund(&env, &token, &latch, 1000);

    let to1 = Address::generate(&env);
    let to2 = Address::generate(&env);

    env.set_auths(&[
        transfer_entry(&latch, &token, &to1, 5, 1),
        transfer_entry(&latch, &token, &to2, 5, 2),
    ]);

    let res = relay_client.try_forward_twice(&token, &latch, &to1, &5_i128, &to2, &5_i128);
    println!("S3a forward_twice (mirror=8, two $5) result: {res:?}");

    assert!(res.is_err(), "double-spend must be blocked");
    // Whole tx reverted: balances and mirror unchanged.
    assert_eq!(token_client.balance(&latch), 1000);
    assert_eq!(latch_client.mirror(), 8);
}

/// S3b: `__check_auth` succeeds and writes the mirror, but the OUTER transfer
/// then fails (insufficient real balance). The mirror write must roll back.
#[test]
fn s3b_mirror_rolls_back_when_transfer_fails_after_check_auth() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env.register(MockToken, (&admin,));
    let token_client = MockTokenClient::new(&env, &token);
    // Mirror inflated to 1000, but real token balance only 10.
    let latch = env.register(LatchDeny, (&token, 1000_i128));
    let latch_client = LatchDenyClient::new(&env, &latch);

    fund(&env, &token, &latch, 10);

    let to = Address::generate(&env);
    env.set_auths(&[transfer_entry(&latch, &token, &to, 50, 1)]);

    // __check_auth passes (50 <= 1000 mirror), writes mirror = 950, then the
    // transfer fails on real balance (10 < 50).
    let res = token_client.try_transfer(&latch, &to, &50_i128);
    println!("S3b transfer result: {res:?}");
    assert!(res.is_err(), "transfer should fail on insufficient real balance");

    // Mirror must be back to 1000 (the __check_auth write was rolled back).
    assert_eq!(latch_client.mirror(), 1000, "mirror must roll back");
    assert_eq!(token_client.balance(&latch), 10);
}

/// S4 (mechanism, local): transaction simulation runs in RECORDING mode, which
/// records auth but does NOT invoke `__check_auth`. Hence the mirror write
/// inside `__check_auth` never enters the simulated footprint — so a real
/// submission (enforcing) writes a key the footprint doesn't cover and fails.
#[test]
fn s4_recording_mode_skips_check_auth_so_mirror_write_missing() {
    // --- Recording mode (what simulateTransaction does) ---
    {
        let env = Env::default();
        let admin = Address::generate(&env);
        let token = env.register(MockToken, (&admin,));
        let token_client = MockTokenClient::new(&env, &token);
        let latch = env.register(LatchDeny, (&token, 1000_i128));
        let latch_client = LatchDenyClient::new(&env, &latch);
        fund(&env, &token, &latch, 1000);

        env.mock_all_auths(); // == switch_to_recording_auth(true)

        let to = Address::generate(&env);
        token_client.transfer(&latch, &to, &50_i128);

        println!(
            "S4 RECORDING: __check_auth count = {}, mirror = {}",
            latch_client.check_auth_count(),
            latch_client.mirror()
        );
        assert_eq!(
            latch_client.check_auth_count(),
            0,
            "__check_auth must NOT run in recording mode"
        );
        assert_eq!(
            latch_client.mirror(),
            1000,
            "mirror must NOT be written in recording mode (footprint misses it)"
        );
    }

    // --- Enforcing mode (real submission) ---
    {
        let env = Env::default();
        let admin = Address::generate(&env);
        let token = env.register(MockToken, (&admin,));
        let token_client = MockTokenClient::new(&env, &token);
        let latch = env.register(LatchDeny, (&token, 1000_i128));
        let latch_client = LatchDenyClient::new(&env, &latch);
        fund(&env, &token, &latch, 1000);

        let to = Address::generate(&env);
        env.set_auths(&[transfer_entry(&latch, &token, &to, 50, 1)]);
        token_client.transfer(&latch, &to, &50_i128);

        println!(
            "S4 ENFORCING: __check_auth count = {}, mirror = {}",
            latch_client.check_auth_count(),
            latch_client.mirror()
        );
        assert_eq!(latch_client.check_auth_count(), 1);
        assert_eq!(latch_client.mirror(), 950);
    }
}

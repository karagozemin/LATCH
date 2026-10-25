#![cfg(test)]
extern crate std;
use std::println;

use soroban_sdk::xdr::{
    Int128Parts, InvokeContractArgs, ScVal, SorobanAddressCredentials,
    SorobanAuthorizationEntry, SorobanAuthorizedFunction, SorobanAuthorizedInvocation,
    SorobanCredentials, StringM, VecM,
};
use soroban_sdk::{auth::Context, testutils::Address as _, Address, Env};

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

/// Auth entry authorizing LATCH for `token.transfer(from=LATCH, to, amount)`.
fn transfer_auth_entry(latch: &Address, token: &Address, to: &Address, amount: i128) -> SorobanAuthorizationEntry {
    SorobanAuthorizationEntry {
        credentials: SorobanCredentials::Address(SorobanAddressCredentials {
            address: latch.clone().try_into().unwrap(),
            nonce: 1,
            signature: ScVal::Void,
            signature_expiration_ledger: 100,
        }),
        root_invocation: SorobanAuthorizedInvocation {
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
        },
    }
}

fn print_contexts(label: &str, ctxs: &soroban_sdk::Vec<Context>) {
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

/// Scenario A check: Relay-mediated transfer WITHIN available must pass, and
/// the nested token transfer must be visible in `auth_contexts` (not just the
/// Relay root).
#[test]
fn s2_relay_transfer_within_available_passes_and_counts() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env.register(MockToken, (&admin,));
    let token_client = MockTokenClient::new(&env, &token);
    let latch = env.register(LatchDeny, (&token, 1000_i128));
    let latch_client = LatchDenyClient::new(&env, &latch);
    let relay = env.register(Relay, ());
    let relay_client = RelayClient::new(&env, &relay);

    fund(&env, &token, &latch, 1000);

    let recipient = Address::generate(&env);
    env.set_auths(&[transfer_auth_entry(&latch, &token, &recipient, 5_i128)]);

    let res = relay_client.try_forward(&token, &latch, &recipient, &5_i128);
    println!("relay.forward result: {res:?}");
    assert!(res.is_ok(), "relay transfer within available should pass");

    assert_eq!(token_client.balance(&recipient), 5);
    assert_eq!(token_client.balance(&latch), 995);
    assert_eq!(latch_client.check_auth_count(), 1);

    let ctxs = latch_client.last_contexts();
    print_contexts("S2 auth_contexts (within available)", &ctxs);

    // The decisive evidence: exactly ONE context, and it is the token
    // transfer (NOT the Relay root). Scenario A.
    assert_eq!(ctxs.len(), 1);
    match ctxs.first() {
        Some(Context::Contract(c)) => {
            assert_eq!(c.contract, token);
            assert_eq!(c.fn_name, soroban_sdk::Symbol::new(&env, "transfer"));
        }
        other => panic!("expected a single Contract(transfer) context, got {other:?}"),
    }
}

/// Scenario A check: Relay-mediated transfer EXCEEDING available must revert
/// with ReservedBalanceViolation (proving the nested transfer is counted).
#[test]
fn s2_relay_transfer_exceeding_available_reverts() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env.register(MockToken, (&admin,));
    let token_client = MockTokenClient::new(&env, &token);
    let latch = env.register(LatchDeny, (&token, 3_i128));
    let latch_client = LatchDenyClient::new(&env, &latch);
    let relay = env.register(Relay, ());
    let relay_client = RelayClient::new(&env, &relay);

    fund(&env, &token, &latch, 1000);

    let recipient = Address::generate(&env);
    env.set_auths(&[transfer_auth_entry(&latch, &token, &recipient, 5_i128)]);

    let res = relay_client.try_forward(&token, &latch, &recipient, &5_i128);
    println!("relay.forward result: {res:?}");
    assert!(res.is_err(), "relay transfer exceeding available must revert");

    // Balance unchanged: nothing leaked.
    assert_eq!(token_client.balance(&recipient), 0);
    assert_eq!(token_client.balance(&latch), 1000);

    let ctxs = latch_client.last_contexts();
    print_contexts("S2 auth_contexts (exceeding available)", &ctxs);

    // Dump host diagnostics so we can see the exact contract error code.
    let diag = env.host().get_diagnostic_events().unwrap();
    for e in diag.0.iter() {
        println!("diag: {:?}", e);
    }
}

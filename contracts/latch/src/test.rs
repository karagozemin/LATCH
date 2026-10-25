extern crate std;

use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    auth::{Context, ContractContext, ContractExecutable, CreateContractHostFnContext},
    testutils::{Address as _, IssuerFlags, Ledger, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, IntoVal, MuxedAddress, Symbol, Val, Vec,
};

use crate::{HoldStatus, Latch, LatchClient, LatchError};

struct Fixture {
    env: Env,
    token: Address,
    latch: Address,
    payer: Address,
    merchant: Address,
    signing_key: SigningKey,
}

fn fixture(initial_balance: i128) -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(admin);
    asset.issuer().set_flag(IssuerFlags::RevocableFlag);
    asset.issuer().set_flag(IssuerFlags::ClawbackEnabledFlag);
    let token = asset.address();
    let payer = Address::generate(&env);
    let merchant = Address::generate(&env);
    let signing_key = SigningKey::from_bytes(&[7; 32]);
    let owner = BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());
    let latch = env.register(Latch, (&owner, &token));

    if initial_balance > 0 {
        StellarAssetClient::new(&env, &token).mint(&payer, &initial_balance);
        LatchClient::new(&env, &latch).deposit(&payer, &initial_balance);
    }

    Fixture {
        env,
        token,
        latch,
        payer,
        merchant,
        signing_key,
    }
}

fn reference(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

fn contract_context(env: &Env, contract: &Address, name: &str, args: Vec<Val>) -> Context {
    Context::Contract(ContractContext {
        contract: contract.clone(),
        fn_name: Symbol::new(env, name),
        args,
    })
}

fn check_auth(
    fixture: &Fixture,
    contexts: Vec<Context>,
) -> Result<(), Result<LatchError, soroban_sdk::InvokeError>> {
    let payload_array = [42_u8; 32];
    let payload = BytesN::from_array(&fixture.env, &payload_array);
    let signature = BytesN::from_array(
        &fixture.env,
        &fixture.signing_key.sign(&payload_array).to_bytes(),
    );
    fixture.env.try_invoke_contract_check_auth::<LatchError>(
        &fixture.latch,
        &payload,
        signature.into_val(&fixture.env),
        &contexts,
    )
}

#[test]
fn full_hold_lifecycle_preserves_capacity() {
    let f = fixture(50);
    let client = LatchClient::new(&f.env, &f.latch);
    let second_merchant = Address::generate(&f.env);

    let first = client.create_hold(
        &f.merchant,
        &30,
        &(f.env.ledger().sequence() + 100),
        &reference(&f.env, 1),
    );
    let second = client.create_hold(
        &second_merchant,
        &15,
        &(f.env.ledger().sequence() + 100),
        &reference(&f.env, 2),
    );
    assert_eq!(client.total_reserved(), 45);
    assert_eq!(client.available(), 5);

    let recipient = Address::generate(&f.env);
    assert_eq!(
        client.try_pay(MuxedAddress::from(recipient.clone()), &10),
        Err(Ok(LatchError::ReservedBalanceViolation))
    );
    client.pay(MuxedAddress::from(recipient.clone()), &4);
    client.capture(&first, &8);
    client.void(&second);

    assert_eq!(TokenClient::new(&f.env, &f.token).balance(&recipient), 4);
    assert_eq!(TokenClient::new(&f.env, &f.token).balance(&f.merchant), 8);
    assert_eq!(client.mirror_balance(), 38);
    assert_eq!(client.real_balance(), 38);
    assert_eq!(client.total_reserved(), 0);
    assert_eq!(client.available(), 38);
    assert_eq!(client.get_hold(&first).status, HoldStatus::Captured);
    assert_eq!(client.get_hold(&second).status, HoldStatus::Voided);
}

#[test]
fn expiry_releases_capacity_without_a_write() {
    let f = fixture(25);
    let client = LatchClient::new(&f.env, &f.latch);
    let expiry = f.env.ledger().sequence() + 10;
    let id = client.create_hold(&f.merchant, &20, &expiry, &reference(&f.env, 3));
    assert_eq!(client.available(), 5);

    f.env
        .ledger()
        .with_mut(|ledger| ledger.sequence_number = expiry + 1);

    assert_eq!(client.available(), 25);
    assert_eq!(client.total_reserved(), 0);
    assert_eq!(client.get_hold(&id).status, HoldStatus::Expired);
    assert!(!client.verify_hold(&id).active);
    assert!(!client.verify_hold(&id).guaranteed);
    assert_eq!(
        client.try_capture(&id, &1),
        Err(Ok(LatchError::HoldExpired))
    );
}

#[test]
fn terminal_holds_cannot_transition_twice() {
    let f = fixture(30);
    let client = LatchClient::new(&f.env, &f.latch);
    let id = client.create_hold(
        &f.merchant,
        &20,
        &(f.env.ledger().sequence() + 100),
        &reference(&f.env, 4),
    );
    client.capture(&id, &12);

    assert_eq!(
        client.try_capture(&id, &1),
        Err(Ok(LatchError::HoldNotActive))
    );
    assert_eq!(client.try_void(&id), Err(Ok(LatchError::HoldNotActive)));
}

#[test]
fn active_hold_count_is_bounded() {
    let f = fixture(100);
    let client = LatchClient::new(&f.env, &f.latch);
    let expiry = f.env.ledger().sequence() + 100;
    for index in 0..16_u8 {
        client.create_hold(&f.merchant, &1, &expiry, &reference(&f.env, index));
    }
    assert_eq!(
        client.try_create_hold(&f.merchant, &1, &expiry, &reference(&f.env, 99)),
        Err(Ok(LatchError::TooManyHolds))
    );
}

#[test]
fn clawback_cannot_spend_reserved_capacity() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(admin);
    asset.issuer().set_flag(IssuerFlags::RevocableFlag);
    asset.issuer().set_flag(IssuerFlags::ClawbackEnabledFlag);
    let token = asset.address();
    let payer = Address::generate(&env);
    let merchant = Address::generate(&env);
    let owner = BytesN::from_array(&env, &[9; 32]);
    let latch = env.register(Latch, (&owner, &token));
    let client = LatchClient::new(&env, &latch);
    let asset_client = StellarAssetClient::new(&env, &token);

    asset_client.mint(&payer, &100);
    client.deposit(&payer, &100);
    client.create_hold(
        &merchant,
        &80,
        &(env.ledger().sequence() + 100),
        &reference(&env, 5),
    );
    asset_client.clawback(&latch, &10);

    assert_eq!(client.real_balance(), 90);
    assert_eq!(client.mirror_balance(), 100);
    assert_eq!(client.available(), 10);
    assert!(client.verify_hold(&1).guaranteed);
    assert_eq!(
        client.try_pay(MuxedAddress::from(Address::generate(&env)), &20),
        Err(Ok(LatchError::ReservedBalanceViolation))
    );
}

#[test]
fn verification_reports_backing_loss_without_hiding_active_status() {
    let f = fixture(100);
    let client = LatchClient::new(&f.env, &f.latch);
    let id = client.create_hold(
        &f.merchant,
        &80,
        &(f.env.ledger().sequence() + 100),
        &reference(&f.env, 51),
    );
    StellarAssetClient::new(&f.env, &f.token).clawback(&f.latch, &30);

    let verification = client.verify_hold(&id);
    assert!(verification.active);
    assert!(!verification.guaranteed);
    assert_eq!(client.available(), 0);
}

#[test]
fn only_the_bound_merchant_can_capture() {
    let f = fixture(20);
    let client = LatchClient::new(&f.env, &f.latch);
    let id = client.create_hold(
        &f.merchant,
        &10,
        &(f.env.ledger().sequence() + 100),
        &reference(&f.env, 52),
    );
    let attacker = Address::generate(&f.env);
    f.env.set_auths(&[]);
    client.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &f.latch,
            fn_name: "capture",
            args: (id, 5_i128).into_val(&f.env),
            sub_invokes: &[],
        },
    }]);

    assert!(client.try_capture(&id, &5).is_err());
    assert_eq!(client.get_hold(&id).status, HoldStatus::Active);
    assert_eq!(TokenClient::new(&f.env, &f.token).balance(&attacker), 0);
}

#[test]
fn capture_preserves_backing_for_other_holds() {
    let f = fixture(100);
    let client = LatchClient::new(&f.env, &f.latch);
    let other = Address::generate(&f.env);
    let expiry = f.env.ledger().sequence() + 100;
    let first = client.create_hold(&f.merchant, &80, &expiry, &reference(&f.env, 6));
    client.create_hold(&other, &10, &expiry, &reference(&f.env, 7));

    StellarAssetClient::new(&f.env, &f.token).clawback(&f.latch, &15);
    assert_eq!(
        client.try_capture(&first, &80),
        Err(Ok(LatchError::BalanceBackingLost))
    );
    client.capture(&first, &0);
    assert_eq!(client.get_hold(&first).captured_amount, 0);
    assert!(client.verify_hold(&2).guaranteed);
}

#[test]
fn check_auth_accepts_exact_self_calls_and_sums_payments() {
    let f = fixture(50);
    let client = LatchClient::new(&f.env, &f.latch);
    client.create_hold(
        &f.merchant,
        &30,
        &(f.env.ledger().sequence() + 100),
        &reference(&f.env, 8),
    );
    let to = MuxedAddress::from(Address::generate(&f.env));
    let pay = contract_context(
        &f.env,
        &f.latch,
        "pay",
        vec![&f.env, to.into_val(&f.env), 10_i128.into_val(&f.env)],
    );
    let create = contract_context(
        &f.env,
        &f.latch,
        "create_hold",
        vec![
            &f.env,
            f.merchant.clone().into_val(&f.env),
            5_i128.into_val(&f.env),
            100_u32.into_val(&f.env),
            reference(&f.env, 9).into_val(&f.env),
        ],
    );
    assert_eq!(check_auth(&f, vec![&f.env, pay, create]), Ok(()));

    let to_a = MuxedAddress::from(Address::generate(&f.env));
    let to_b = MuxedAddress::from(Address::generate(&f.env));
    let pay_a = contract_context(
        &f.env,
        &f.latch,
        "pay",
        vec![&f.env, to_a.into_val(&f.env), 11_i128.into_val(&f.env)],
    );
    let pay_b = contract_context(
        &f.env,
        &f.latch,
        "pay",
        vec![&f.env, to_b.into_val(&f.env), 10_i128.into_val(&f.env)],
    );
    assert_eq!(
        check_auth(&f, vec![&f.env, pay_a, pay_b]),
        Err(Ok(LatchError::ReservedBalanceViolation))
    );
}

#[test]
fn check_auth_rejects_token_third_party_and_unknown_self_calls() {
    let f = fixture(50);
    let empty = Vec::new(&f.env);

    let direct_token = contract_context(&f.env, &f.token, "transfer", empty.clone());
    assert_eq!(
        check_auth(&f, vec![&f.env, direct_token]),
        Err(Ok(LatchError::DirectTokenCallsDisabled))
    );

    let third_party = contract_context(&f.env, &Address::generate(&f.env), "steal", empty.clone());
    assert_eq!(
        check_auth(&f, vec![&f.env, third_party]),
        Err(Ok(LatchError::ForbiddenOperation))
    );

    let unknown_self = contract_context(&f.env, &f.latch, "sync", empty);
    assert_eq!(
        check_auth(&f, vec![&f.env, unknown_self]),
        Err(Ok(LatchError::ForbiddenSelfCall))
    );

    let create_contract = Context::CreateContractHostFn(CreateContractHostFnContext {
        executable: ContractExecutable::Wasm(reference(&f.env, 61)),
        salt: reference(&f.env, 62),
    });
    assert_eq!(
        check_auth(&f, vec![&f.env, create_contract]),
        Err(Ok(LatchError::ForbiddenOperation))
    );
}

#[test]
fn invalid_signature_is_rejected_by_the_host_crypto_boundary() {
    let f = fixture(10);
    let payload = BytesN::from_array(&f.env, &[42_u8; 32]);
    let invalid_signature = BytesN::from_array(&f.env, &[0_u8; 64]);
    let result = f.env.try_invoke_contract_check_auth::<LatchError>(
        &f.latch,
        &payload,
        invalid_signature.into_val(&f.env),
        &Vec::new(&f.env),
    );

    assert!(matches!(result, Err(Err(_))));
}

#[test]
fn terminal_history_is_compacted_when_the_bounded_map_fills() {
    let f = fixture(100);
    let client = LatchClient::new(&f.env, &f.latch);
    let expiry = f.env.ledger().sequence() + 100;
    let mut first = 0;
    for index in 0..64_u8 {
        let id = client.create_hold(&f.merchant, &1, &expiry, &reference(&f.env, index));
        if index == 0 {
            first = id;
        }
        client.void(&id);
    }

    let newest = client.create_hold(&f.merchant, &1, &expiry, &reference(&f.env, 100));
    assert_eq!(newest, 65);
    assert_eq!(
        client.try_get_hold(&first),
        Err(Ok(LatchError::HoldNotFound))
    );
    assert_eq!(client.total_reserved(), 1);
}

#[test]
fn invalid_amounts_and_hold_bounds_are_rejected() {
    let f = fixture(20);
    let client = LatchClient::new(&f.env, &f.latch);
    let expiry = f.env.ledger().sequence() + 100;

    assert_eq!(
        client.try_create_hold(&f.merchant, &0, &expiry, &reference(&f.env, 10)),
        Err(Ok(LatchError::InvalidAmount))
    );
    assert_eq!(
        client.try_create_hold(&f.merchant, &21, &expiry, &reference(&f.env, 11)),
        Err(Ok(LatchError::InsufficientAvailable))
    );
    let id = client.create_hold(&f.merchant, &10, &expiry, &reference(&f.env, 12));
    assert_eq!(
        client.try_capture(&id, &11),
        Err(Ok(LatchError::ExceedsHoldMaximum))
    );
}

#[test]
fn permissionless_sync_reconciles_external_inflow() {
    let f = fixture(20);
    let client = LatchClient::new(&f.env, &f.latch);
    StellarAssetClient::new(&f.env, &f.token).mint(&f.latch, &7);

    assert_eq!(client.real_balance(), 27);
    assert_eq!(client.mirror_balance(), 20);
    assert_eq!(client.sync(), 27);
    assert_eq!(client.mirror_balance(), 27);
    assert_eq!(client.available(), 27);
    assert_eq!(TokenClient::new(&f.env, &f.token).balance(&f.payer), 0);
}

use soroban_sdk::{contracttype, Address, BytesN};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HoldStatus {
    Active,
    Captured,
    Voided,
    Expired,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Hold {
    pub id: u64,
    pub merchant: Address,
    pub maximum: i128,
    pub expires_at: u32,
    pub reference: BytesN<32>,
    pub status: HoldStatus,
    pub captured_amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HoldVerification {
    pub active: bool,
    pub guaranteed: bool,
    pub merchant: Address,
    pub maximum: i128,
    pub expires_at: u32,
    pub reference: BytesN<32>,
}

#[contracttype]
#[derive(Clone)]
pub(crate) enum DataKey {
    Owner,
    Token,
    MirrorBalance,
    Holds,
    NextHoldId,
}

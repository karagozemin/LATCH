use soroban_sdk::{contractevent, Address, MuxedAddress};

#[contractevent]
pub struct Initialized {
    pub owner: soroban_sdk::BytesN<32>,
    pub token: Address,
}

#[contractevent]
pub struct Deposited {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Paid {
    #[topic]
    pub to: MuxedAddress,
    pub amount: i128,
}

#[contractevent]
pub struct HoldCreated {
    #[topic]
    pub id: u64,
    #[topic]
    pub merchant: Address,
    pub maximum: i128,
    pub expires_at: u32,
}

#[contractevent]
pub struct HoldCaptured {
    #[topic]
    pub id: u64,
    #[topic]
    pub merchant: Address,
    pub amount: i128,
}

#[contractevent]
pub struct HoldVoided {
    #[topic]
    pub id: u64,
    #[topic]
    pub merchant: Address,
}

#[contractevent]
pub struct BalanceSynced {
    pub balance: i128,
}

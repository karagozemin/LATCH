use soroban_sdk::contracterror;

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum LatchError {
    ForbiddenSelfCall = 1,
    DirectTokenCallsDisabled = 2,
    ForbiddenOperation = 3,
    ReservedBalanceViolation = 4,
    HoldNotFound = 5,
    HoldNotActive = 6,
    ExceedsHoldMaximum = 7,
    HoldExpired = 8,
    InsufficientAvailable = 9,
    TooManyHolds = 10,
    HoldDurationTooLong = 11,
    InvalidAmount = 12,
    InvalidExpiration = 13,
    BalanceBackingLost = 14,
    ArithmeticOverflow = 15,
}

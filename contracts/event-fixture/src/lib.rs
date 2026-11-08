#![no_std]
use soroban_sdk::{contract, contractevent, contractimpl, Address, Env, Symbol};

// Demonstration events only. No token transfers, accounting, balances, or custody.
#[contractevent(topics = ["credit"])]
pub struct Credit {
    #[topic]
    pub account: Symbol,
    pub amount: u32,
}

#[contract]
pub struct EventFixture;

#[contractimpl]
impl EventFixture {
    pub fn credit(env: Env, actor: Address, account: Symbol, amount: u32) {
        actor.require_auth();
        assert!(amount > 0, "amount must be positive");
        Credit { account, amount }.publish(&env);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        map, symbol_short,
        testutils::{Address as _, Events},
        vec, IntoVal, Map, Val, Vec,
    };

    #[test]
    fn publishes_requested_credit_event() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(EventFixture, ());
        let client = EventFixtureClient::new(&env, &id);
        let actor = Address::generate(&env);
        client.credit(&actor, &symbol_short!("alice"), &4);
        let events = env.events().all();
        let topics = vec![
            &env,
            symbol_short!("credit").into_val(&env),
            symbol_short!("alice").into_val(&env),
        ];
        let data: Map<Symbol, u32> = map![&env, (symbol_short!("amount"), 4_u32)];
        let expected: Vec<(Address, Vec<Val>, Val)> = vec![&env, (id, topics, data.into_val(&env))];
        assert_eq!(events, expected);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn rejects_zero_amount() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(EventFixture, ());
        let client = EventFixtureClient::new(&env, &id);
        client.credit(&Address::generate(&env), &symbol_short!("alice"), &0);
    }

    #[test]
    fn rejects_unauthorized_actor() {
        let env = Env::default();
        let id = env.register(EventFixture, ());
        let client = EventFixtureClient::new(&env, &id);
        assert!(client
            .try_credit(&Address::generate(&env), &symbol_short!("alice"), &4)
            .is_err());
    }
}

#![cfg_attr(not(feature = "std"), no_std)]

use ink_lang as ink;

#[ink::contract(version = "0.1.0", env = DefaultXrmlTypes)]
mod xrc20 {
    use ink_core::{
        env::{chainx_calls, chainx_types::Call, DefaultXrmlTypes},
        storage,
    };
    use ink_prelude::vec::Vec;
    use scale::Encode;

    pub type Text = Vec<u8>;

    #[ink(event)]
    struct Transfer {
        #[ink(topic)]
        from: Option<AccountId>,
        #[ink(topic)]
        to: Option<AccountId>,
        value: u64,
    }

    #[ink(event)]
    struct Approval {
        owner: AccountId,
        spender: AccountId,
        value: u64,
    }

    #[ink(event)]
    struct Issue {
        to: AccountId,
        value: u64,
    }

    #[ink(event)]
    struct Destroy {
        owner: AccountId,
        value: u64,
    }

    /// The storage items for a typical XRC20 token implementation.
    #[ink(storage)]
    struct Xrc20 {
        /// The total supply.
        total_supply: storage::Value<u64>,
        /// The Decimals of this token.
        /// We choose u16 instead of u8 here in that the parity_codec 3.5 is lack of u8 support.
        decimals: storage::Value<u16>,
        /// The Name of the token.
        name: storage::Value<Text>,
        /// The Symbol of the token.
        symbol: storage::Value<Text>,
        /// The balance of each user.
        balances: storage::HashMap<AccountId, u64>,
        /// u64s that are spendable by non-owners: (owner, spender) -> allowed
        allowances: storage::HashMap<(AccountId, AccountId), u64>,
    }

    impl Xrc20 {
        #[ink(constructor)]
        fn new(&mut self, init_value: u64, name: Text, symbol: Text, decimals: u16) {
            assert!(self.env().caller() != AccountId::from([0; 32]));
            self.total_supply.set(init_value);
            self.name.set(name);
            self.symbol.set(symbol);
            self.decimals.set(decimals);
            self.balances.insert(self.env().caller(), init_value);
            self.env().emit_event(Transfer {
                from: None,
                to: Some(self.env().caller()),
                value: init_value,
            });
        }

        /// Returns the total number of tokens in existence.
        #[ink(message)]
        fn total_supply(&self) -> u64 {
            *self.total_supply
        }

        /// Returns the balance of the given AccountId.
        #[ink(message)]
        fn balance_of(&self, owner: AccountId) -> u64 {
            self.balance_of_or_zero(&owner)
        }

        /// Returns the name of the token.
        #[ink(message)]
        fn name(&self) -> Text {
            let name = &*self.name;
            name.to_vec()
        }

        /// Returns the symbol of the token.
        #[ink(message)]
        fn symbol(&self) -> Text {
            let symbol = &*self.symbol;
            symbol.to_vec()
        }

        /// Returns the decimals of the token.
        #[ink(message)]
        fn decimals(&self) -> u16 {
            *self.decimals
        }

        /// Returns the amount of tokens that an owner allowed to a spender.
        #[ink(message)]
        fn allowance(&self, owner: AccountId, spender: AccountId) -> u64 {
            self.allowance_or_zero(&owner, &spender)
        }

        /// Transfers token from the sender to the `to` AccountId.
        #[ink(message)]
        fn transfer(&mut self, to: AccountId, value: u64) -> bool {
            self.transfer_impl(self.env().caller(), to, value)
        }

        /// Approve the passed AccountId to spend the specified amount of tokens
        /// on the behalf of the message's sender.
        #[ink(message)]
        fn approve(&mut self, spender: AccountId, value: u64) -> bool {
            let owner = self.env().caller();
            self.allowances.insert((owner, spender), value);
            self.env().emit_event(Approval {
                owner,
                spender,
                value,
            });
            true
        }

        /// Transfer tokens from one AccountId to another.
        #[ink(message)]
        fn transfer_from(&mut self, from: AccountId, to: AccountId, value: u64) -> bool {
            let caller = self.env().caller();
            let allowance = self.allowance_or_zero(&from, &caller);
            if allowance < value {
                return false;
            }
            if self.transfer_impl(from, to, value) {
                self.allowances.insert((from, caller), allowance - value);
                true
            } else {
                false
            }
        }

        #[ink(message)]
        fn issue(&mut self, to: AccountId, value: u64) -> bool {
            assert!(to != AccountId::from([0; 32]));
            // notice just the contract instance self could call `issue`, do not allow user to
            // issue from other way.
            assert_eq!(self.env().account_id(), self.env().caller());

            let balance = self.balance_of_or_zero(&to);
            let previous_total = *self.total_supply;

            // there is no case that the user balance could large then total supply
            if balance > previous_total {
                return false;
            }

            // check overflow
            // balance + value
            let new_balance = match balance.checked_add(value) {
                Some(b) => b,
                None => return false,
            };
            // total_supply + value
            let new_total_supply = match (*self.total_supply).checked_add(value) {
                Some(b) => b,
                None => return false,
            };

            if value == 0 {
                // before set storage
                self.env().emit_event(Issue { to, value });
                return true;
            }

            // set storage
            self.balances.insert(to, new_balance);
            self.total_supply.set(new_total_supply);

            assert_eq!(balance + value, self.balance_of_or_zero(&to));
            assert_eq!(previous_total + value, *self.total_supply);

            // print event
            self.env().emit_event(Issue { to, value });
            true
        }

        #[ink(message)]
        fn destroy(&mut self, value: u64) -> bool {
            let owner = self.env().caller();
            assert!(owner != AccountId::from([0; 32]));

            let balance = self.balance_of_or_zero(&owner);
            let previous_total = *self.total_supply;

            // there is no case that the user balance could large then total supply
            if balance > previous_total {
                return false;
            }

            // can't destroy more than current value
            if value > balance {
                return false;
            }
            // check overflow
            // balance - value
            let new_balance = match balance.checked_sub(value) {
                Some(b) => b,
                None => return false,
            };
            // total_supply - value
            let new_total_supply = match (*self.total_supply).checked_sub(value) {
                Some(b) => b,
                None => return false,
            };

            if value == 0 {
                // before set storage
                self.env().emit_event(Destroy { owner, value });
                return true;
            }

            // set storage
            self.balances.insert(owner, new_balance);
            self.total_supply.set(new_total_supply);

            assert_eq!(balance - value, self.balance_of_or_zero(&owner));
            assert_eq!(previous_total - value, *self.total_supply);

            self.env().emit_event(Destroy { owner, value });

            // Convert the destoried xrc20 Token to crosschain Asset in ChainX.
            let convert_to_asset_call =
                Call::XContracts(
                    chainx_calls::XContracts::<DefaultXrmlTypes>::convert_to_asset(owner, value),
                );
            let _ = self.env().invoke_runtime(&convert_to_asset_call);
            true
        }

        ///private function
        fn balance_of_or_zero(&self, of: &AccountId) -> u64 {
            *self.balances.get(of).unwrap_or(&0)
        }

        /// Returns the allowance or 0 of there is no allowance.
        fn allowance_or_zero(&self, owner: &AccountId, spender: &AccountId) -> u64 {
            *self.allowances.get(&(*owner, *spender)).unwrap_or(&0)
        }

        /// Transfers token from a specified AccountId to another AccountId.
        fn transfer_impl(&mut self, from: AccountId, to: AccountId, value: u64) -> bool {
            assert!(from != AccountId::from([0; 32]));
            assert!(to != AccountId::from([0; 32]));

            let balance_from = self.balance_of_or_zero(&from);
            let balance_to = self.balance_of_or_zero(&to);

            let previous_balances = balance_from + balance_to;

            if balance_from < value {
                return false;
            }
            // balance_from - value
            let new_balance_from = match balance_from.checked_sub(value) {
                Some(b) => b,
                None => return false,
            };
            // balance_to + value
            let new_balance_to = match balance_to.checked_add(value) {
                Some(b) => b,
                None => return false,
            };

            // not same to solidity, we set value in the end. thus we do more check before
            // other logic
            if from == to || value == 0 {
                // before set storage
                self.env().emit_event(Transfer {
                    from: Some(from),
                    to: Some(to),
                    value,
                });
                return true;
            }

            // set to storage
            self.balances.insert(from, new_balance_from);
            self.balances.insert(to, new_balance_to);

            // ensure total balance is equal to before
            assert_eq!(
                previous_balances,
                self.balance_of_or_zero(&from) + self.balance_of_or_zero(&to)
            );

            self.env().emit_event(Transfer {
                from: Some(from),
                to: Some(to),
                value,
            });
            true
        }
    }

    #[cfg(all(test, feature = "test-env"))]
    mod tests {
        use super::*;
        use ink_core::env;
        type Types = ink_core::env::DefaultXrmlTypes;

        #[test]
        fn deployment_works() {
            let alice = AccountId::from([0x1; 32]);
            env::test::set_caller::<Types>(alice);
            let name: Text = "ChainX".as_bytes().to_vec();
            let symbol: Text = "PCX".as_bytes().to_vec();
            let decimals: u16 = 18;

            // Deploy the contract with some `init_value`
            let xrc20 = XRC20::deploy_mock(1234, name.clone(), symbol.clone(), decimals);
            // Check that the `total_supply` is `init_value`
            assert_eq!(xrc20.total_supply(), 1234);
            // Check that the `name` is `name`
            assert_eq!(xrc20.name(), name);
            // Check that the `symbol` is `symbol`
            assert_eq!(xrc20.symbol(), symbol);
            // Check that the `decimals` is `decimals`
            assert_eq!(xrc20.decimals(), decimals);
            // Check that `balance_of` Alice is `init_value`
            assert_eq!(xrc20.balance_of(alice), 1234);
        }

        #[test]
        fn transfer_works() {
            let alice = AccountId::from([0x1; 32]);
            let bob = AccountId::from([0x2; 32]);
            let name: Text = "ChainX".as_bytes().to_vec();
            let symbol: Text = "PCX".as_bytes().to_vec();
            let decimals: u16 = 18;

            env::test::set_caller::<Types>(alice);
            // Deploy the contract with some `init_value`
            let mut xrc20 = XRC20::deploy_mock(1234, name.clone(), symbol.clone(), decimals);
            // Alice does not have enough funds for this
            assert_eq!(xrc20.transfer(bob, 4321), false);
            // Alice can do this though
            assert_eq!(xrc20.transfer(bob, 234), true);
            // Check Alice and Bob have the expected balance
            assert_eq!(xrc20.balance_of(alice), 1000);
            assert_eq!(xrc20.balance_of(bob), 234);
        }

        #[test]
        fn allowance_works() {
            let alice = AccountId::from([0x1; 32]);
            let bob = AccountId::from([0x2; 32]);
            let charlie = AccountId::from([0x3; 32]);
            let name: Text = "ChainX".as_bytes().to_vec();
            let symbol: Text = "PCX".as_bytes().to_vec();
            let decimals: u16 = 18;

            env::test::set_caller::<Types>(alice);
            // Deploy the contract with some `init_value`
            let mut xrc20 = XRC20::deploy_mock(1234, name.clone(), symbol.clone(), decimals);
            // Bob does not have an allowance from Alice's balance
            assert_eq!(xrc20.allowance(alice, bob), 0);
            // Thus, Bob cannot transfer out of Alice's account
            env::test::set_caller::<Types>(bob);
            assert_eq!(xrc20.transfer_from(alice, bob, 1), false);
            // Alice can approve bob for some of her funds
            env::test::set_caller::<Types>(alice);
            assert_eq!(xrc20.approve(bob, 20), true);
            // And the allowance reflects that correctly
            assert_eq!(xrc20.allowance(alice, bob), 20);
            // Charlie cannot send on behalf of Bob
            env::test::set_caller::<Types>(charlie);
            assert_eq!(xrc20.transfer_from(alice, bob, 10), false);
            // Bob cannot transfer more than he is allowed
            env::test::set_caller::<Types>(bob);
            assert_eq!(xrc20.transfer_from(alice, charlie, 25), false);
            // A smaller amount should work though
            assert_eq!(xrc20.transfer_from(alice, charlie, 10), true);
            // Check that the allowance is updated
            assert_eq!(xrc20.allowance(alice, bob), 10);
            // and the balance transferred to the right person
            assert_eq!(xrc20.balance_of(charlie), 10);
        }

        #[test]
        fn events_work() {
            let alice = AccountId::from([0x1; 32]);
            let bob = AccountId::from([0x2; 32]);
            let name: Text = "ChainX".as_bytes().to_vec();
            let symbol: Text = "PCX".as_bytes().to_vec();
            let decimals: u16 = 18;

            // No events to start
            env::test::set_caller::<Types>(alice);
            assert_eq!(env::test::emitted_events::<Types>().count(), 0);
            // Event should be emitted for initial minting
            let mut xrc20 = XRC20::deploy_mock(1234, name.clone(), symbol.clone(), decimals);
            assert_eq!(env::test::emitted_events::<Types>().count(), 1);
            // Event should be emitted for approvals
            assert_eq!(xrc20.approve(bob, 20), true);
            assert_eq!(env::test::emitted_events::<Types>().count(), 2);
            // Event should be emitted for transfers
            assert_eq!(xrc20.transfer(bob, 10), true);
            assert_eq!(env::test::emitted_events::<Types>().count(), 3);
        }

        #[test]
        fn destroy_work() {
            let alice = AccountId::from([0x1; 32]);
            let name: Text = "ChainX".as_bytes().to_vec();
            let symbol: Text = "PCX".as_bytes().to_vec();
            let decimals: u16 = 18;

            env::test::set_caller::<Types>(alice);
            // Deploy the contract with some `init_value`
            let mut xrc20 = XRC20::deploy_mock(1234, name.clone(), symbol.clone(), decimals);
            // Alice does not have enough funds for this
            assert_eq!(xrc20.destroy(234), true);
            assert_eq!(xrc20.balance_of(alice), 1000);
            assert_eq!(xrc20.total_supply(), 1000);
        }
    }
}

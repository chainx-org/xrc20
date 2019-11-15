# XRC20

XRC20 is a special smart contract based on the ERC20 standard, used for converting the interchain assets of ChainX to XRC20 Token back and forth.

<!-- TOC GFM -->

* [Build](#build)
    * [`cargo-contract`](#cargo-contract)
    * [Build the contract](#build-the-contract)
* [Local development](#local-development)

<!-- /TOC -->

## Build

### `cargo-contract`

compile this contract need ChainX's cargo-contract. Please fetch the ChainX's ink! and compile for it first.

Make sure you have built [chainx-org/ink]:

```bash
$ git clone https://github.com/chainx-org/ink
$ cd ink
$ cargo +nightly build --release
```

Then add the compiled binary `cargo-contract` present in `./target/release/cargo-contract` to the `PATH` for the convenience.

```bash
$ export PATH=$PWD/target/release:$PATH
```

### Build the contract

```bash
$ git clone https://github.com/chainx-org/xrc20
$ cd xrc20
# Build the wasm
$ cargo-contract contract build
# Generate the contract ABI
$ cargo +nightly run -p abi-gen
```

## Local development

Before playing around with asset ChainX XBTC using the smart contract, you have to deploy and specify a unique XRC20 instance on the chain. After that, you can move the XBTC to this contract and then convert it back. We have provided a script to help the deployment of this XRC20 contract:

```bash
$ cd scripts
$ npm install commander chainx.js
```

Make sure you have built the XRC20 contract, i.e., xrc20.wasm and abi.json are present in target directory. Otherwise you have specify the wasm and abi path, see `./scripts/dev-deploy-btcxrc20.js --help`. Then you 
then developer could execute the script to set XRC20 for X-BTC or deposit some fake X-BTC token to an account

```bash
# Set XRC20 contract instance, ** this only needs to be executed only once!**
$ node dev-deploy-btcxrc20.js -s

# Deposit X-BTC token, i.e., convert ChainX XBTC to XBTC token.
# ./dev-deploy-btcxrc20.js -d <Address>
$ ./dev-deploy-btcxrc20.js -d "5EwWdzxq......"
```

You can also claim the PCX reward for the validator Alice in case you are running out of PCX.

```bash
$ ./dev-deploy-btcxrc20.js -c
```

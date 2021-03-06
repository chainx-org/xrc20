# XRC20

XRC20 is a special smart contract based on the ERC20 standard, used for converting the interchain assets of ChainX to XRC20 Token back and forth.

<!-- TOC GFM -->

* [Build](#build)
    * [Docker](#docker)
    * [`cargo-contract`](#cargo-contract)
    * [Build the contract](#build-the-contract)
* [Local development](#local-development)

<!-- /TOC -->

## Build

### Docker

The compiled wasm is different on different computers, even they are using the same OS and same source file. Using Docker which provides the required environment for building a contract can guarantee you can always get the same wasm file per ink contract.

```bash
$ docker run --rm -v "$PWD":/build -w /build chainxorg/contract-builder:v0.6.0 cargo contract build
 [1/4] Collecting crate metadata
 [2/4] Building cargo project
    Finished release [optimized] target(s) in 1.08s
 [3/4] Post processing wasm file
 [4/4] Optimizing wasm file
 Original wasm size: 53.2K, Optimized: 34.6K

Your contract is ready. You can find it here:
/build/target/xrc20.wasm

# Now the complied wasm file is in your local directory target/xrc20.wasm.
```

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
$ cargo-contract contract generate-metadata
```

## Local development

Before playing around with asset ChainX XBTC using the smart contract, you have to deploy and specify a unique XRC20 instance on the chain. After that, you can move the XBTC to this contract and then convert it back. We have provided a script to help the deployment of this XRC20 contract:

```bash
$ cd scripts
$ npm install commander chainx.js --save
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

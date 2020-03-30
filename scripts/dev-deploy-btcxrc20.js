#!/usr/bin/env node
/**
 *
 * npm install commander chainx.js
 * Usage：
 * Set BTC Xrc20 Address：
 *          node dev-deploy-btcxrc20.js -s
 *
 * Deposit ChainX X-BTC to Address without real transfer BTC to Bitcoin trustee address (Default would deposit 1 BTC):
 *          node dev-deploy-btcxrc20.js -d <Address>
 *
 *  Claim PCX：
 *          node dev-deploy-btcxrc20.js -c
 *
 */

var program = require('commander');
var fs = require('fs');
const Chainx = require('chainx.js').default;
const { compactAddLength } = require('@chainx/util');
const { Abi } = require('@chainx/api-contract');

program
    .version('0.1.0')
    .option('-s, --set ', 'Set BTC Xrc20 Address')
    .option('-y, --deploy', 'sigal deploy contract')
    .option('-d, --deposit [VALUE]', 'Deposit BTC to Address')
    .option('-x, --xrc [VALUE]', 'convert x-btc to xrc')
    .option('-c, --claim ', 'Claim PCX')
    .option('-w, --wasm [WASM-PATH]', 'Path of the compiled wasm file', './target/xrc20.wasm')
    .option('-a, --abi [ABI-PATH]', 'Path of the generated ABI file', './target/metadata.json')
    //.option('-W, --ws [WEBSOCKET]', 'Webscoket of the ChainX node', 'ws://47.111.243.151:8187')
    .option('-W, --ws [WEBSOCKET]', 'Webscoket of the ChainX node', 'ws://127.0.0.1:8087')
    .parse(process.argv);

const parseParams = (args, params) => {
    args.forEach((arg, i) => {
        const t = arg.type.type
        if (t.startsWith('u')) {
            params[i] = parseInt(params[i])
        } else if (t === 'bool' && typeof params[i] === 'string') {
            params[i] = JSON.parse(params[i].toLowerCase())
        }
    })
    return params
}

(async function () {
    var wasmPath = program.wasm
    var abiPath = program.abi
    var websocket = program.ws

    // prikey for alice
    // this prikey's pubkey is: 0x88dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee
    const alicePrikey = '0xabf8e5bdbe30c65656c0a3cbd181ff8a56294a69dfedd27982aace4a76909115'
    // xrc20 wasm file and related abi
    var wasm = fs.readFileSync(wasmPath)
    var abi = require(abiPath)
    let xrc20 = new Abi(abi)
    // node websocket ip and port
    const chainx = new Chainx(websocket);
    let gasLimit = 20000000;

    await chainx.isRpcReady();
    if (program.set) {
        let putcode = chainx.api.tx.xContracts.putCode(gasLimit, compactAddLength(wasm))
        putcode.signAndSend(alicePrikey, (error, response) => {
            if (error) {
                console.log(error.message)
                process.exit(0);
            }
            console.log(response)

            for (var i = 0; response && response.events && (i < response.events.length); i++) {
                if ('CodeStored' == response.events[i].method) {
                    let codeHash = response.events[i].event.data[0]
                    console.log("upload and set wasm code success...", codeHash)

                    const method = 'instantiate'
                    params = [0, 'ChainX XRC20-Bitcoin', 'XRC20-BTC-6', 8]
                    parseParams(xrc20.constructors[0].args, params)
                    const selector = JSON.parse(abi.contract.constructors[0].selector)
                    const args = [
                        0,
                        gasLimit,
                        codeHash,
                        selector.reduce((a, b) => a + b.slice(2)) +
                        xrc20.constructors[0](...params).slice(2)
                    ]
                    const ex = chainx.api.tx.xContracts[method](...args)
                    ex.signAndSend(alicePrikey, (error, response) => {
                        if (error) {
                            console.log(error.message)
                            process.exit(0);
                        }
                        for (var i = 0; response && response.events && (i < response.events.length); i++) {
                            if ('ContractExecution' == response.events[i].method) {
                                let contract_address = response.events[i].event.data[0]
                                console.log("instance xrc20 contract... addr:", contract_address)

                                // notice the selector must match abi.json(or old_abi.json), hex format
                                let execute = chainx.trustee.execute('0x67df26a755e0c31ac81e2ed530d147d7f2b9a3f5a570619048c562b1ed00dfdd',
                                    chainx.api.tx.xContracts.setTokenXrc20('BTC', contract_address,
                                        new Map([
                                            ['BalanceOf', '0x26BB1DE4'],
                                            ['TotalSupply', '0x925D9338'],
                                            ['Name', '0x011341D0'],
                                            ['Symbol', '0x983EE954'],
                                            ['Decimals', '0x936544E0'],
                                            ['Issue', '0x8C83649D'],
                                            ['Destroy', '0x4B37C918']
                                        ])
                                    )
                                );
                                execute.signAndSend(alicePrikey, (error, response) => {
                                    if (error) {
                                        console.log(error.message)
                                        process.exit(0);
                                    }
                                    for (var i = 0; response && response.events && (i < response.events.length); i++) {
                                        if ('ExtrinsicSuccess' == response.events[i].method) {
                                            console.log('set xrc20 contract addr success...')
                                            process.exit(0);
                                        } else if ('ExtrinsicFailed' == response.events[i].method) {
                                            console.log('set erc20 contract addr fail...')
                                            process.exit(0);
                                        }
                                    }
                                })
                                // breakc
                            } else if ('ExtrinsicFailed' == response.events[i].method) {
                                console.log("instance erc20 contract fail ")
                                process.exit(0);
                            }
                        }
                    })
                } else if ('ExtrinsicFailed' == response.events[i].method) {
                    console.log("instance erc20 contract fail... ")
                    process.exit(0);
                }
            }
        });
    } else if (program.deposit) {
        let execute = chainx.trustee.execute('0x67df26a755e0c31ac81e2ed530d147d7f2b9a3f5a570619048c562b1ed00dfdd',
            // default deposit 1 BTC (1 * 10000000)
            chainx.api.tx.xAssetsRecords.depositFromRoot(program.deposit, 'BTC', 100000000)
        );
        execute.signAndSend(alicePrikey, (error, response) => {
            if (error) {
                console.log(error.message)
                process.exit(0);
            }
            for (var i = 0; response && response.events && (i < response.events.length); i++) {
                if ('ExtrinsicSuccess' == response.events[i].method) {
                    console.log('Deposit ChainX X-BTC success...')
                    process.exit(0);
                } else if ('ExtrinsicFailed' == response.events[i].method) {
                    console.log("Deposit Erc20 BTC fail...")
                    process.exit(0);
                }
            }
        })
    } else if (program.deploy) {
        //code hash, only deploy
        let codeHash = '0xddee4f839228421da2677267b116730c0a3521796088385ed5235e333285d839'

        const method = 'instantiate'
        params = [0, 'ChainX XRC20-Bitcoin', 'XRC20-BTC-7', 8]
        parseParams(xrc20.constructors[0].args, params)
        const selector = JSON.parse(abi.contract.constructors[0].selector)
        const args = [
            0,
            gasLimit,
            codeHash,
            selector.reduce((a, b) => a + b.slice(2)) +
            xrc20.constructors[0](...params).slice(2)
        ]
        const ex = chainx.api.tx.xContracts[method](...args)
        ex.signAndSend(alicePrikey, (error, response) => {
            if (error) {
                console.log(error.message)
                process.exit(0);
            }
            for (var i = 0; response && response.events && (i < response.events.length); i++) {
                if ('ContractExecution' == response.events[i].method) {
                    let contract_address = response.events[i].event.data[0]
                    console.log("instance xrc20 contract... addr:", contract_address)

                    // notice the selector must match abi.json(or old_abi.json), hex format
                    let execute = chainx.trustee.execute('0x67df26a755e0c31ac81e2ed530d147d7f2b9a3f5a570619048c562b1ed00dfdd',
                        chainx.api.tx.xContracts.setTokenXrc20('BTC', contract_address,
                            new Map([
                                ['BalanceOf', '0x26BB1DE4'],
                                ['TotalSupply', '0x925D9338'],
                                ['Name', '0x011341D0'],
                                ['Symbol', '0x983EE954'],
                                ['Decimals', '0x936544E0'],
                                ['Issue', '0x8C83649D'],
                                ['Destroy', '0x4B37C918']
                            ])
                        )
                    );
                    execute.signAndSend(alicePrikey, (error, response) => {
                        if (error) {
                            console.log(error.message)
                            process.exit(0);
                        }
                        for (var i = 0; response && response.events && (i < response.events.length); i++) {
                            if ('ExtrinsicSuccess' == response.events[i].method) {
                                console.log('set xrc20 contract addr success...')
                                process.exit(0);
                            } else if ('ExtrinsicFailed' == response.events[i].method) {
                                console.log('set erc20 contract addr fail...')
                                process.exit(0);
                            }
                        }
                    })
                    // breakc
                } else if ('ExtrinsicFailed' == response.events[i].method) {
                    console.log("instance erc20 contract fail ")
                    process.exit(0);
                }
            }
        })

    } else if (program.xrc) {
        let execute = chainx.api.tx.xContracts.convertToXrc20('BTC',
            10000,
            50000000
        );
        execute.signAndSend(alicePrikey, (error, response) => {
            if (error) {
                console.log(error.message)
                process.exit(0);
            }
            for (var i = 0; response && response.events && (i < response.events.length); i++) {
                if ('ExtrinsicSuccess' == response.events[i].method) {
                    console.log('Convert Xrc20-BTC success...')
                    process.exit(0);
                } else if ('ExtrinsicFailed' == response.events[i].method) {
                    console.log("Convert Xrc20-BTC fail...")
                    process.exit(0);
                }
            }
        })
    } else if (program.claim) {
        let execute = chainx.stake.voteClaim('0x88dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee');
        execute.signAndSend(alicePrikey, (error, response) => {
            if (error) {
                console.log(error.message)
                process.exit(0);
            }
            for (var i = 0; response && response.events && (i < response.events.length); i++) {
                if ('ExtrinsicSuccess' == response.events[i].method) {
                    console.log('Claim PCX success...')
                    process.exit(0);
                } else if ('ExtrinsicFailed' == response.events[i].method) {
                    console.log("Claim PCX fail...")
                    process.exit(0);
                }
            }
        })
    }
    else {
        console.log("Error Cmd...")
        process.exit(0);
    }

})()



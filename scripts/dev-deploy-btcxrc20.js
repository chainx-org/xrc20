#!/usr/bin/env node
/**
 *
 * npm install commander chainx.js
 * Usage：
 * Set BTC Xrc20 Address：
 *          node dev-deploy-btcxrc20.js -s --key  'your account privatekey'
 *
 * Deposit ChainX X-BTC to Address without real transfer BTC to Bitcoin trustee address (Default would deposit 1 BTC):
 *          node dev-deploy-btcxrc20.js -d <Address>
 * 
 * Deploy exist CodeHash:
 *          node dev-deploy-btcxrc20.js -y <CodeHash>
 *
 *  Claim PCX：
 *          node dev-deploy-btcxrc20.js -c
 *
 */

var program = require('commander');
var fs = require('fs');
const Chainx = require('chainx.js').default;
const { blake2AsU8a } = require('@chainx/util-crypto')
const { compactAddLength } = require('@chainx/util');
const { Abi } = require('@chainx/api-contract');


program
    .version('0.1.0')
    .option('-s, --set ', 'Set BTC Xrc20 Address')
    .option('-y, --deploy <VALUE>', 'sigal deploy contract')
    .option('-d, --deposit <VALUE>', 'Deposit BTC to Address')
    .option('-x, --xrc [VALUE]', 'convert x-btc to xrc')
    .option('-c, --claim ', 'Claim PCX')
    .option('-k, --key [PRIVATEKEY]', 'Set Private Key', '0xabf8e5bdbe30c65656c0a3cbd181ff8a56294a69dfedd27982aace4a76909115')
    .option('-w, --wasm [WASM-PATH]', 'Path of the compiled wasm file', '../target/xrc20.wasm')
    .option('-a, --abi [ABI-PATH]', 'Path of the generated ABI file', '../target/metadata.json')
    //.option('-W, --ws [WEBSOCKET]', 'Webscoket of the ChainX node', 'ws://47.111.243.151:8187')
    .option('-W, --ws [WEBSOCKET]', 'Webscoket of the ChainX node', 'ws://127.0.0.1:8087')
    .parse(process.argv);

/*
 * parse params
*/
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

/*
 * we want to know if codehash  exist
 * @param chainx
 * @param codeHash contract codehash
*/
async function isCodeHashExist(chainx, codeHash) {
    const result = await chainx.api.query.xContracts.pristineCode(codeHash)
    if (result.length > 0) {
        return true
    } else {
        return false
    }
}

/**
 *  claim balance to account
 */
async function getAccountBalance(chainx, privateKey) {
    const account = chainx.account.from(privateKey);
    const address = account.address()
    const assets = await chainx.asset.getAssetsByAccount(address, 0, 10);
    const filtered = assets.data.filter(asset => asset.name === "PCX");
    const balance = (filtered.length > 0 ? filtered[0].details.Free : 0);
    return balance / Math.pow(10, 8)
}

/*
 * if contract  exist
 * @param chainx
 * @param address contract address
*/
async function isContractExist(chainx, address) {
    try {
        const result = await chainx.api.query.xContracts.contractInfoOf(address)
        if (result.isEmpty) {
            return false
        } else {
            return true
        }
    } catch (error) {
        console.log(error)
        return false
    }
}

/*
 * upload contract
 * @param chainx
 * @param file gas cb
*/
async function uploadContract(chainx, wasm, gasLimit, Alice) {
    const method = 'putCode'
    let codehash = '0x'
    blake2AsU8a(wasm).forEach(i => {
        codehash += ('0' + i.toString(16)).slice(-2)
    })
    return new Promise(async (reslove, reject) => {
        const isExist = await isCodeHashExist(chainx, codehash)
        if (isExist) {
            console.log('contract code Exist, do not need to upload')
            reslove(codehash)
            return
        }
        const args = [gasLimit, compactAddLength(wasm)]
        const ex = chainx.api.tx.xContracts[method](...args)
        ex.signAndSend(Alice, (error, response) => {
            //console.log(response)
            for (var i = 0; response && response.events && (i < response.events.length); i++) {
                if ('CodeStored' == response.events[i].method) {
                    console.log("upload contract success...", response.events[i].event.data[0])
                    reslove(response.events[i].event.data[0])
                } else if ('ExtrinsicFailed' == response.events[i].method) {
                    console.log("upload failed...", codehash)
                    reslove(codehash)
                }
            }
        })
    })
}

/*
 * upload contract
 * @param chainx
 * @param file gas cb
*/
async function deploy(chainx, _abi, codeHash, params, endowment, gas, Alice) {
    const xrc20 = new Abi(_abi)
    const method = 'instantiate'
    parseParams(xrc20.constructors[0].args, params)
    const selector = JSON.parse(_abi.contract.constructors[0].selector)
    const args = [
        endowment,
        gas,
        codeHash,
        selector.reduce((a, b) => a + b.slice(2)) +
        xrc20.constructors[0](...params).slice(2)
    ]
    console.log('deploy abi in utils ')
    return new Promise((resolve, reject) => {
        const ex = chainx.api.tx.xContracts[method](...args)
        ex.signAndSend(Alice, (error, response) => {
            for (var i = 0; response && response.events && (i < response.events.length); i++) {
                if ('ContractExecution' == response.events[i].method) {
                    let contract_address = response.events[i].event.data[0]
                    console.log("instance erc20 contract success")
                    resolve(contract_address)
                } else if ('ExtrinsicFailed' == response.events[i].method) {
                    console.log("instance erc20 contract fail")
                    reject({ err: "instance erc20 contract fail, please make sure you have the right codehash or try the other code hash" })
                }
            }
        })
    })
}

/**
 * 
 * claim pcx 
 * 
 */
async function claim(chainx, alicePrikey) {
    let execute = chainx.stake.voteClaim('0x88dc3417d5058ec4b4503e0c12ea1a0a89be200fe98922423d4334014fa6b0ee');
    return new Promise((resolve, reject) => {
        execute.signAndSend(alicePrikey, (error, response) => {
            if (error) {
                reject(error)
            }
            for (var i = 0; response && response.events && (i < response.events.length); i++) {
                if ('ExtrinsicSuccess' == response.events[i].method) {
                    resolve({ result: true, msg: 'Claim PCX success...' })
                } else if ('ExtrinsicFailed' == response.events[i].method) {
                    resolve({ result: false, msg: 'Claim PCX Faild' })
                }
            }
        })
    })
}

//check if balance enough 
async function init(chainx, alicePrikey) {
    const balance = await getAccountBalance(chainx, alicePrikey)
    console.log('account balance is:' + balance)
    if (balance < 20) {
        await claim(chainx, alicePrikey).then(res => {
            console.log(res)
        }).catch(err => {
            console.log("please make sure the account address correct, alicePrikey:", alicePrikey)
            process.exit(0);
        })
    }
}

(
    async function () {
        var wasmPath = program.wasm
        var abiPath = program.abi
        var websocket = program.ws
        var alicePrikey = program.key

        var wasm = fs.readFileSync(wasmPath)
        var abi = require(abiPath)
        // node websocket ip and port
        const chainx = new Chainx(websocket);
        let gasLimit = 20000000;

        await chainx.isRpcReady();
        if (program.set) {
            // init contract， check balance, check if contract have been uploaded already
            await init(chainx, alicePrikey)
            // upload contract
            let codehash = await uploadContract(chainx, wasm, gasLimit, alicePrikey).then(
                res => {
                    if (!res) {
                        console.log("upload contract failed")
                        process.exit(0);
                    }
                    return res
                }
            ).catch(err => {
                console.log(err)
                process.exit(0);
            })
            // print contract codehash
            console.log('codehash :', codehash)
            // contract deploy params
            params = [0, 'ChainX XRC20-Bitcoin', 'XRC20-BTC', 8]
            // deploy contract 
            let contract_address = await deploy(chainx, abi, codehash, params, 0, gasLimit, alicePrikey).then(
                res => { return res }
            ).catch(err => {
                console.log(err)
                process.exit(0);
            })
            //get contract address
            console.log('contract address: ', contract_address)
            // notice the selector must match abi.json(or old_abi.json), hex format
            if (contract_address) {
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
            }
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
            await init(chainx, alicePrikey)
            let codehash = program.deploy
            console.log('codehash :', codehash)
            params = [0, 'ChainX XRC20-Bitcoin', 'XRC20-BTC', 8]
            let contract_address = await deploy(chainx, abi, codehash, params, 0, gasLimit, alicePrikey).then(
                res => { return res }
            ).catch(err => {
                console.log(err)
                process.exit(0);
            })
            console.log('contract address: ', contract_address)

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
            await claim(chainx, alicePrikey).then(res => {
                console.log(res)
                process.exit(0);
            }).catch(err => {
                console.log(err)
                process.exit(0);
            })
        }
    }
)();

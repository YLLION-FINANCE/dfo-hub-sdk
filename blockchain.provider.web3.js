var configuration = require('./configuration.json');

var globalScope = typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};

module.exports = function Web3BlockchainProvider(engine) {
    var context = this;

    engine.currentProvider && engine.currentProvider.setMaxListeners && engine.currentProvider.setMaxListeners(0);
    engine.eth.transactionBlockTimeout = 999999999;
    engine.eth.transactionPollingTimeout = new Date().getTime();

    context.getNetworkId = function getNetworkId() {
        return engine.eth.net.getId()
    };

    context.sha3 = function sha3(data) {
        return engine.utils.sha3(data);
    };

    context.newContract = function newContract(abi, address) {
        return new engine.eth.Contract(abi, address);
    };

    context.getPastLogs = function getPastLogs(params) {
        return engine.eth.getPastLogs(params);
    };

    context.decodeAbi = function decodeAbi(type, value) {
        return engine.eth.abi["decodeParameter" + ((typeof type).toLowerCase() === 'string' ? '' : 's')](type, value);
    };

    context.encodeAbi = function encodeAbi(type, value) {
        return engine.eth.abi["encodeParameter" + ((typeof type).toLowerCase() === 'string' ? '' : 's')](type, value);
    };

    context.blockchainCall = async function blockchainCall(call) {
        var args = [];
        if (arguments.length > 1) {
            for (var i = 1; i < arguments.length; i++) {
                args.push(arguments[i]);
            }
        }
        var method = (call.implementation ? call.get : call.new ? call.new : call).apply(call, args);
        return await (method._method.stateMutability === 'view' || method._method.stateMutability === 'pure' ? method.call(await context.getSendingOptions()) : context.sendBlockchainTransaction(method));
    };

    context.sendBlockchainTransaction = function sendBlockchainTransaction(transaction) {
        return new Promise(async function(ok, ko) {
            var handleTransactionError = function handleTransactionError(e) {
                e !== undefined && e !== null && (e.message || e).indexOf('not mined within') === -1 && ko(e);
            }
            try {
                (transaction = transaction.send ? transaction.send(await context.getSendingOptions(transaction), handleTransactionError) : transaction).on('transactionHash', transactionHash => {
                    var timeout = async function() {
                        var receipt = await engine.eth.getTransactionReceipt(transactionHash);
                        if (!receipt || !receipt.blockNumber || parseInt(await engine.eth.getBlockNumber()) < (parseInt(receipt.blockNumber) + (configuration.transactionConfirmations || 0))) {
                            return globalScope.setTimeout(timeout, configuration.transactionConfirmationsTimeoutMillis);
                        }
                        return transaction.then(ok);
                    };
                    globalScope.setTimeout(timeout);
                }).catch(handleTransactionError);
            } catch (e) {
                return handleTransactionError(e);
            }
        });
    };

    context.getAddress = async function getAddress() {
        globalScope && globalScope.ethereum && globalScope.ethereum.enable && await globalScope.ethereum.enable();
        return (context.walletAddress = (await engine.eth.getAccounts())[0]);
    };

    context.getSendingOptions = function getSendingOptions(transaction) {
        return new Promise(async function(ok, ko) {
            if (transaction) {
                var address = await context.getAddress();
                return transaction.estimateGas({
                        from: address,
                        gasPrice: engine.utils.toWei("13", "gwei")
                    },
                    function(error, gas) {
                        if (error) {
                            return ko(error.message || error);
                        }
                        return ok({
                            from: address,
                            gas: gas || configuration.gasLimit || '7900000'
                        });
                    });
            }
            return ok({
                from: context.walletAddress || null,
                gas: configuration.gasLimit || '7900000'
            });
        });
    };
};
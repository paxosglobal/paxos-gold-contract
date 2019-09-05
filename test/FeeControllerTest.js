const PAXGMock = artifacts.require('PAXGWithBalance.sol');
const Proxy = artifacts.require('AdminUpgradeabilityProxy.sol');

const assertRevert = require('./helpers/assertRevert');
const ethSigUtil = require('eth-sig-util');

// Tests that PAXG fee controller capabilities function correctly.
contract('Fee Controller PAXG', function ([_, admin, feeController, feeRecipient, recipient, otherAddress, owner]) {
    const ownerStartingBalance = 100000000000000;

    beforeEach(async function () {
        const paxg = await PAXGMock.new({from: owner});
        const proxy = await Proxy.new(paxg.address, {from: admin});
        const proxiedPAXG = await PAXGMock.at(proxy.address);
        await proxiedPAXG.initialize({from: owner});
        // initialize with 1,000,000
        await proxiedPAXG.initializeBalance(owner, ownerStartingBalance);
        this.token = proxiedPAXG;
    });

    describe('when the contract is first deployed', function () {
        it('has the current fee controller set to the contract owner', async function () {
            let currentFeeController = await this.token.feeController();
            assert.equal(currentFeeController, owner);
        });
        it('has feeDecimals set to 6', async function () {
            let currentFeeDecimals = await this.token.feeDecimals();
            assert.equal(currentFeeDecimals, 6);
        });
        it('has feeParts set to 1,000,000', async function () {
            let currentFeeParts = await this.token.feeParts();
            assert.equal(currentFeeParts, 1000000);
        });
        it('has a fee rate of 0', async function () {
            let currentFeeRate = await this.token.feeRate();
            assert.equal(currentFeeRate, 0)
        });
        it('sends a fee of 0 for a 10000 tansfer', async function () {
            const amount = 10000;
            const expectedFee = 0;
            await this.token.transfer(otherAddress, amount, {from: owner});
            const senderBalance = await this.token.balanceOf(owner);
            assert.equal(senderBalance, ownerStartingBalance - amount);

            const recipientBalance = await this.token.balanceOf(otherAddress);
            assert.equal(recipientBalance, amount - expectedFee);

            const feeBalance = await this.token.balanceOf(feeController);
            assert.equal(feeBalance, expectedFee);
        });
        it('sends a fee of 0 for a 10000 tansferFrom', async function () {
            await this.token.approve(otherAddress, ownerStartingBalance, {from: owner})
            const amount = 10000;
            const expectedFee = 0;
            await this.token.transferFrom(owner, recipient, amount, {from: otherAddress});
            const senderBalance = await this.token.balanceOf(owner);
            assert.equal(senderBalance, ownerStartingBalance - amount);

            const recipientBalance = await this.token.balanceOf(recipient);
            assert.equal(recipientBalance, amount - expectedFee);

            const feeBalance = await this.token.balanceOf(feeRecipient);
            assert.equal(feeBalance, expectedFee);
        });
    });

    describe('contract fee permissions', function () {
        // Set the fee controller for each test
        beforeEach(async function () {
            let currentFeeController = await this.token.feeController();
            if (currentFeeController !== feeController) {
                await this.token.setFeeController(feeController, {from: owner});
            }
            await this.token.topupBalance(owner, ownerStartingBalance);
        });

        const feeRate = 200;
        const zeroAddress = '0x0000000000000000000000000000000000000000';

        // FeeController Permissions
        it('can set fee rate by feeController', async function () {
            const {logs} = await this.token.setFeeRate(feeRate, {from: feeController});
            let currentFeeRate = await this.token.feeRate();
            assert.equal(currentFeeRate, feeRate);
            assert.equal(logs.length, 1);
            assert.equal(logs[0].event, 'FeeRateSet');
            assert.equal(logs[0].args.oldFeeRate, 0);
            assert.equal(logs[0].args.newFeeRate, feeRate);
        });
        it('can set fee controller to new address by feeController', async function () {
            const {logs} = await this.token.setFeeController(otherAddress, {from: feeController});
            let currentFeeController = await this.token.feeController();
            assert.equal(currentFeeController, otherAddress);
            assert.equal(logs.length, 1);
            assert.equal(logs[0].event, 'FeeControllerSet');
            assert.equal(logs[0].args.oldFeeController, feeController);
            assert.equal(logs[0].args.newFeeController, otherAddress);
        });
        it('can set fee recipient to new address by feeController', async function () {
            const {logs} = await this.token.setFeeRecipient(feeRecipient, {from: feeController});
            let currentFeeRecipient = await this.token.feeRecipient();
            assert.equal(currentFeeRecipient, feeRecipient);
            assert.equal(logs.length, 1);
            assert.equal(logs[0].event, 'FeeRecipientSet');
            assert.equal(logs[0].args.oldFeeRecipient, owner);
            assert.equal(logs[0].args.newFeeRecipient, feeRecipient);
        });

        // Contract Owner Permissions
        it('can set fee controller to new address by contract owner', async function () {
            const {logs} = await  this.token.setFeeController(otherAddress, {from: owner});
            let currentFeeController = await this.token.feeController();
            assert.equal(currentFeeController, otherAddress);
            assert.equal(logs.length, 1);
            assert.equal(logs[0].event, 'FeeControllerSet');
            assert.equal(logs[0].args.oldFeeController, feeController);
            assert.equal(logs[0].args.newFeeController, otherAddress);
        });
        it('cannot set fee rate by contract owner', async function () {
            await assertRevert(this.token.setFeeRate(feeRate, {from: owner}));
        });
        it('cannot set fee recipient to new address by contract owner', async function () {
            await assertRevert(this.token.setFeeRecipient(feeRecipient, {from: owner}));
        });

        // Other Unauthorized Permissions
        it('errors when fee rate is set by unauthorized address', async function () {
            await assertRevert(this.token.setFeeRate(feeRate, {from: otherAddress}));
        });
        it('errors when fee controller is set by unauthorized address', async function () {
            await assertRevert(this.token.setFeeController(otherAddress, {from: otherAddress}));
        });
        it('errors when fee recipient is set by unauthorized address', async function () {
            await assertRevert(this.token.setFeeRecipient(otherAddress, {from: otherAddress}));
        });
        it('cannot set fee controller to 0 address', async function () {
            await assertRevert(this.token.setFeeController(zeroAddress, {from: owner}));
        });
        it('cannot set fee recipient to 0 address', async function () {
            await assertRevert(this.token.setFeeRecipient(zeroAddress, {from: owner}));
        });
    });

    describe('fee rate tests', function () {
        beforeEach(async function () {
            let currentFeeController = await this.token.feeController();
            if (currentFeeController !== feeController) {
                await this.token.setFeeController(feeController, {from: owner});
            }
        });

        describe('can accept multiple fee rate changes', function () {
            const feeRatesTest = [
                {name: '200', rate: 200},
                {name: '0', rate: 0},
                {name: '1000', rate: 1000},
                {name: '10000', rate: 10000}
            ];
            feeRatesTest.forEach((test) => {
                it(test.name, async function () {
                    await this.token.setFeeRate(test.rate, {from: feeController});
                    let currentFeeRate = await this.token.feeRate();
                    assert.equal(currentFeeRate, test.rate);
                });
            });
        });

        it('cannot have a fee rate of over 1000000 fee parts', async function () {
            const feeRate = 1000001;
            await assertRevert(this.token.setFeeRate(feeRate, {from: feeController}));
        });
    });

    describe('transfer fee tests', function () {
        const feeRate = 200;
        const tests = [{
            name: (func) => `sends a fee of 2 for a 10000 ${func}`,
            amount: 10000,
            expectedFee: 2,
        }, {
            name: (func) => `sends a fee of 0 for a 100 ${func}`,
            amount: 100,
            expectedFee: 0,
        }, {
            // rounds down
            name: (func) => `sends a fee of 0 for a 4999 ${func}`,
            amount: 4999,
            expectedFee: 0,
        }, {
            name: (func) => `sends a fee of 1 for a 9999 ${func}`,
            amount: 9999,
            expectedFee: 1,
        }, {
            name: (func) => `sends a fee of 2 for a 12500 ${func}`,
            amount: 12500,
            expectedFee: 2,
        }, {
            name: (func) => `sends a fee of 2 for a 14999 ${func}`,
            amount: 14999,
            expectedFee: 2,
        }, {
            name: (func) => `sends a fee of 20 for a 104999 ${func}`,
            amount: 104999,
            expectedFee: 20,
        }, {
            name: (func) => `sends a fee of 200 for a 1049990 ${func}`,
            amount: 1049990,
            expectedFee: 209,
        }, {
            name: (func) => `sends a fee of 199999 for a 999999999 ${func}`,
            amount: 999999999,
            expectedFee: 199999,
        }];

        describe('gets right fee on getFeeFor', function () {
            beforeEach(async function () {
                let currentFeeController = await this.token.feeController();
                if (currentFeeController !== feeController) {
                    await this.token.setFeeController(feeController, {from: owner});
                }
                await this.token.setFeeRate(feeRate, {from: feeController});
            });

            tests.forEach((test) => {
                it(test.name('getFeeFor'), async function () {
                    let feeFromContract = await this.token.getFeeFor(test.amount);
                    assert.equal(feeFromContract, test.expectedFee)
                });
            });
        });

        describe('basic fees on transfers', function () {
            beforeEach(async function () {
                let currentFeeController = await this.token.feeController();
                if (currentFeeController !== feeController) {
                    await this.token.setFeeController(feeController, {from: owner});
                }
                await this.token.setFeeRecipient(feeRecipient, {from: feeController});
                await this.token.setFeeRate(feeRate, {from: feeController});
                await this.token.topupBalance(owner, ownerStartingBalance);
            });

            tests.forEach((test) => {
                it(test.name('transfer'), async function () {
                    const {logs} = await this.token.transfer(recipient, test.amount, {from: owner});
                    const senderBalance = await this.token.balanceOf(owner);
                    assert.equal(senderBalance, ownerStartingBalance - test.amount);

                    const recipientBalance = await this.token.balanceOf(recipient);
                    assert.equal(recipientBalance, test.amount - test.expectedFee);

                    const feeBalance = await this.token.balanceOf(feeRecipient);
                    assert.equal(feeBalance, test.expectedFee);

                    // check event logs
                    const logLength = test.expectedFee === 0 ? 2 : 3;
                    assert.equal(logs.length, logLength);
                    assert.equal(logs[0].event, 'Transfer');
                    assert.equal(logs[0].args.from, owner);
                    assert.equal(logs[0].args.to, recipient);
                    assert.equal(logs[0].args.value, test.amount - test.expectedFee);

                    assert.equal(logs[1].event, 'Transfer');
                    assert.equal(logs[1].args.from, owner);
                    assert.equal(logs[1].args.to, feeRecipient);
                    assert.equal(logs[1].args.value, test.expectedFee);

                    if (logLength === 3) {
                        assert.equal(logs[2].event, 'FeeCollected');
                        assert.equal(logs[2].args.from, owner);
                        assert.equal(logs[2].args.to, feeRecipient);
                        assert.equal(logs[2].args.value, test.expectedFee);
                    }
                })
            });
        });

        describe('basic fees on transferFroms', function () {
            beforeEach(async function () {
                let currentFeeController = await this.token.feeController();
                if (currentFeeController !== feeController) {
                    await this.token.setFeeController(feeController, {from: owner});
                }
                await this.token.setFeeRecipient(feeRecipient, {from: feeController});
                await this.token.setFeeRate(feeRate, {from: feeController});
                await this.token.topupBalance(owner, ownerStartingBalance);
                await this.token.approve(otherAddress, ownerStartingBalance, {from: owner})
            });

            tests.forEach((test) => {
                it(test.name('transferFrom'), async function () {
                    const {logs} = await this.token.transferFrom(owner, recipient, test.amount, {from: otherAddress});
                    const senderBalance = await this.token.balanceOf(owner);
                    assert.equal(senderBalance, ownerStartingBalance - test.amount);

                    const recipientBalance = await this.token.balanceOf(recipient);
                    assert.equal(recipientBalance, test.amount - test.expectedFee);

                    const feeBalance = await this.token.balanceOf(feeRecipient);
                    assert.equal(feeBalance, test.expectedFee);

                    // check event logs
                    const logLength = test.expectedFee === 0 ? 2 : 3;
                    assert.equal(logs.length, logLength);
                    assert.equal(logs[0].event, 'Transfer');
                    assert.equal(logs[0].args.from, owner);
                    assert.equal(logs[0].args.to, recipient);
                    assert.equal(logs[0].args.value, test.amount - test.expectedFee);

                    assert.equal(logs[1].event, 'Transfer');
                    assert.equal(logs[1].args.from, owner);
                    assert.equal(logs[1].args.to, feeRecipient);
                    assert.equal(logs[1].args.value, test.expectedFee);

                    if (test.expectedFee > 0) {
                        assert.equal(logs[2].event, 'FeeCollected');
                        assert.equal(logs[2].args.from, owner);
                        assert.equal(logs[2].args.to, feeRecipient);
                        assert.equal(logs[2].args.value, test.expectedFee);
                    }
                });
            });
        });

        describe('basic fees on betaDelegatedTransfers', function () {
            // private key for token from address
            const privateKey = new Buffer("43f2ee33c522046e80b67e96ceb84a05b60b9434b0ee2e3ae4b1311b9f5dcc46", 'hex');
            // EIP-55 of ethereumjsUtil.bufferToHex(ethereumjsUtil.privateToAddress(privateKey));
            const fromAddress = '0xBd2e9CaF03B81e96eE27AD354c579E1310415F39';
            const serviceFeeAmount = 1;
            const executor = otherAddress;

            beforeEach(async function () {
                let currentFeeController = await this.token.feeController();
                if (currentFeeController !== feeController) {
                    await this.token.setFeeController(feeController, {from: owner});
                }
                await this.token.setFeeRecipient(feeRecipient, {from: feeController});
                await this.token.setFeeRate(feeRate, {from: feeController});

                this.betaDelegatedTransferContext = {
                    types: {
                        EIP712Domain: [
                            {name: 'name', type: 'string'},
                            {name: 'verifyingContract', type: 'address'},
                        ],
                        BetaDelegatedTransfer: [
                            {name: 'to', type: 'address'},
                            {name: 'value', type: 'uint256'},
                            {name: 'serviceFee', type: 'uint256'},
                            {name: 'seq', type: 'uint256'},
                            {name: 'deadline', type: 'uint256'},
                        ],
                    },
                    primaryType: 'BetaDelegatedTransfer',
                    domain: {
                        name: 'Paxos Gold',
                        verifyingContract: this.token.address,
                    },
                };

                // send the tokens to the custom wallet
                let {receipt} = await this.token.topupBalance(fromAddress, ownerStartingBalance);
                this.blockNumber = receipt.blockNumber;

                // check starting balance
                let senderBalance = await this.token.balanceOf(fromAddress);
                assert.equal(senderBalance, ownerStartingBalance);
                let executorBalance = await this.token.balanceOf(executor);
                assert.equal(executorBalance.toNumber(), 0);
                let recipientBalance = await this.token.balanceOf(recipient);
                assert.equal(recipientBalance.toNumber(), 0);

                // check the seq
                let nextSeq = await this.token.nextSeqOf(fromAddress);
                assert.equal(nextSeq.toNumber(), 0);

                // set the whitelister
                await this.token.setBetaDelegateWhitelister(owner, {from: owner});

                // whitelist the executor address
                await this.token.whitelistBetaDelegate(executor, {from: owner});
            });

            tests.forEach((test) => {
                it(test.name('betaDelegatedTransfer'), async function () {
                    // delegated transfer message
                    let message = {
                        to: recipient,
                        value: test.amount,
                        serviceFee: serviceFeeAmount,
                        seq: 0,
                        deadline: this.blockNumber + 100,
                    };

                    // create delegated transfer
                    const typedData = {
                        ...this.betaDelegatedTransferContext,
                        message,
                    };

                    // sign the delegated transfer with the token holder address
                    const sig = ethSigUtil.signTypedData(privateKey, {data: typedData});

                    // commit delegated transfer
                    let {to, value, serviceFee, seq, deadline} = message;
                    const {logs} = await this.token.betaDelegatedTransfer(sig, to, value, serviceFee, seq, deadline, {from: executor});

                    // check balances
                    let senderBalance = await this.token.balanceOf(fromAddress);
                    assert.equal(senderBalance, ownerStartingBalance - (test.amount + serviceFeeAmount));
                    let executorBalance = await this.token.balanceOf(executor);
                    assert.equal(executorBalance, serviceFeeAmount);
                    const recipientBalance = await this.token.balanceOf(recipient);
                    assert.equal(recipientBalance, test.amount - test.expectedFee);
                    const feeBalance = await this.token.balanceOf(feeRecipient);
                    assert.equal(feeBalance, test.expectedFee);

                    const logLength = test.expectedFee === 0 ? 4 : 5;
                    assert.equal(logs.length, logLength);

                    assert.equal(logs[0].event, 'Transfer');
                    assert.equal(logs[0].args.from, fromAddress);
                    assert.equal(logs[0].args.to, recipient);
                    assert.equal(logs[0].args.value, test.amount - test.expectedFee);

                    assert.equal(logs[1].event, 'Transfer');
                    assert.equal(logs[1].args.from, fromAddress);
                    assert.equal(logs[1].args.to, feeRecipient);
                    assert.equal(logs[1].args.value, test.expectedFee);

                    if (test.expectedFee > 0) {
                        assert.equal(logs[2].event, 'FeeCollected');
                        assert.equal(logs[2].args.from, fromAddress);
                        assert.equal(logs[2].args.to, feeRecipient);
                        assert.equal(logs[2].args.value, test.expectedFee);
                    }

                    assert.equal(logs[logLength - 2].event, 'Transfer');
                    assert.equal(logs[logLength - 2].args.from, fromAddress);
                    assert.equal(logs[logLength - 2].args.to, executor);
                    assert.equal(logs[logLength - 2].args.value, serviceFeeAmount);

                    assert.equal(logs[logLength - 1].event, 'BetaDelegatedTransfer');
                    assert.equal(logs[logLength - 1].args.from, fromAddress);
                    assert.equal(logs[logLength - 1].args.to, recipient);
                    assert.equal(logs[logLength - 1].args.value, test.amount - test.expectedFee);
                    assert.equal(logs[logLength - 1].args.serviceFee, serviceFeeAmount);
                    assert.equal(logs[logLength - 1].args.seq, seq);
                });
            });
        });
    });
});

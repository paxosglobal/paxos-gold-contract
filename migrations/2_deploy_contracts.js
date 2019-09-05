const PAXG = artifacts.require('PAXGImplementation');
const Proxy = artifacts.require('AdminUpgradeabilityProxy');

module.exports = async function(deployer) {
  await deployer;

  await deployer.deploy(PAXG);
  const proxy = await deployer.deploy(Proxy, PAXG.address);
  const proxiedPAXG = await PAXG.at(proxy.address);
  await proxy.changeAdmin("0xf0b1eef88956b0a307fa87b5f5671aad6a5d330f");
  await proxiedPAXG.initialize();
};

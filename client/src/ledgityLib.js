async function getInfo(contract) {
  const decimals = await contract.methods.decimals().call();
  let totalSupply = await contract.methods.totalSupply().call();
  totalSupply = (totalSupply / 10 ** decimals).toString();
  let allSupply = await contract.methods.allSupply().call();
  allSupply = (allSupply / 10 ** decimals).toString();
  const name = await contract.methods.name().call();
  const symbol = await contract.methods.symbol().call();
  let maxTokenTx = await contract.methods.maxTokenTx().call();
  maxTokenTx = (maxTokenTx / 10 ** decimals).toString();
  let totalFee = await contract.methods.totalFee().call();
  totalFee = (totalFee / 10 ** decimals).toString();
  let totalBurn = await contract.methods.totalBurn().call();
  totalBurn = (totalBurn / 10 ** decimals).toString();
  const price = await contract.methods.getPrice().call();
  const startPrice = await contract.methods.getStartPrice().call();
  const owner = await contract.methods.owner().call();
  return {
    totalSupply,
    allSupply,
    name,
    decimals,
    symbol,
    maxTokenTx,
    totalFee,
    totalBurn,
    startPrice,
    price,
    owner,
  };
}

async function getTokenBalance(contract, address) {
  const balance = await contract.methods.balanceOf(address.toString()).call();
  const decimals = await contract.methods.decimals().call();
  return (balance / 10 ** decimals).toString();
}

async function getBalance(web3, account) {
  const balance = await web3.eth.getBalance(account);
  return web3.utils.fromWei(balance, "ether");
}

async function getDex(contract) {
  const dex = await contract.methods.getDex().call();
  return dex;
}

async function getExcluded(contract) {
  const excluded = await contract.methods.getExcluded().call();
  return excluded;
}

async function transfer(contract, signer, address, amount) {
  const decimals = await contract.methods.decimals().call();
  amount = amount * 10 ** decimals;
  const balance = await contract.methods
    .transfer(address.toString(), amount.toString())
    .send({ from: signer });
  return balance;
}

async function setPrice(contract, signer, newPrice) {
  const status = await contract.methods
    .setPrice(newPrice.toString())
    .send({ from: signer });
  return status;
}

async function burn(contract, signer, amount) {
  const decimals = await contract.methods.decimals().call();
  amount = amount * 10 ** decimals;
  const status = await contract.methods
    .burn(amount.toString())
    .send({ from: signer });
  return status;
}

async function setDex(contract, signer, dexAddress) {
  await contract.methods.setDex(dexAddress.toString()).send({ from: signer });
}

async function includeAccount(contract, signer, address) {
  await contract.methods
    .includeAccount(address.toString())
    .send({ from: signer });
}

async function excludeAccount(contract, signer, address) {
  await contract.methods
    .excludeAccount(address.toString())
    .send({ from: signer });
}

async function addTokenToWallet(contract, ethereum, tokenAddress) {
  try {
    const info = await getInfo(contract);

    ethereum.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: tokenAddress,
          symbol: info.symbol,
          decimals: info.decimals,
          image: "https://i.ibb.co/D1gFDs8/Icon-circle-Colore-512.png",
        },
      },
    });
  } catch (error) {
    console.error(error);
  }
}

export {
  getInfo,
  getTokenBalance,
  getBalance,
  addTokenToWallet,
  transfer,
  getDex,
  getExcluded,
  setPrice,
  burn,
  setDex,
  excludeAccount,
  includeAccount,
};

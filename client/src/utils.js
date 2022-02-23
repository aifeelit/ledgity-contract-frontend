async function getBalance(web3, account) {
  const balance = await web3.eth.getBalance(account);
  return web3.utils.fromWei(balance, "ether");
}

/**
 * Check MetaMask status
 * NOTE: If the user is logged out, then it will still true
 * @return {Boolean} Return true, if MetaMask installed and connected
 * @public
 */
function isMetaMask() {
  if (window.ethereum) {
    return true;
  } else {
    return false;
  }
}

function delay(_DELAY = 5) {
  return new Promise((resolve, reject) => {
    // console.log(`Delay ${_DELAY}`)
    setTimeout(() => {
      resolve(`Time is up`);
    }, _DELAY * 1000);
  });
}

export { getBalance, isMetaMask, delay };

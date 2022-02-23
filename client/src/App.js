import React, { Component } from "react";
import LedgityContract from "./contracts/contracts/Ledgity.sol/Ledgity.json";
import getWeb3 from "./getWeb3";
import * as Lib from "./ledgityLib";

import { Header } from "./components/layout";
import { Dashboard, Connect } from "./pages";

import "./App.scss";

const LedgityContractAbi = LedgityContract.abi;
const LedgityContractAddress = "0x70c7A1700E3EC966D142C1E4a998965382B55B05";

const ws = new WebSocket("ws://52.12.224.224:9000");

class App extends Component {
  state = {
    storageValue: 0,
    web3: null,
    accounts: null,
    contract: null,
    ethereum: null,
    loading: true,
    isOwner: false,
    users: null,
  };

  componentDidMount = async () => {
    ws.onopen = () => {
      console.log("CONECT WS");
    };
    ws.onclose = () => {
      console.log("CLOSE WS");
    };
    ws.onmessage = (response) => {
      this.setState({ users: response.data });
    };
    if (window.ethereum) {
      this.setState({
        ethereum: window.ethereum,
      });
    }
  };

  connect = async () => {
    console.log(this.state.users);
    const web3 = await getWeb3();
    this.setState({
      web3: web3,
    });

    try {
      // Get network provider and web3 instance.

      // Use web3 to get the user's accounts.
      const accounts = await this.state.ethereum.request({
        method: "eth_accounts",
      });

      // Get the contract instance.
      const instance = new web3.eth.Contract(
        LedgityContractAbi,
        LedgityContractAddress
      );

      // Set web3, accounts, and contract to the state, and then proceed with an
      // example of interacting with the contract's methods.
      this.setState({ web3, accounts, contract: instance }, this.runExample);
    } catch (error) {
      // Catch any errors for any of the above operations.
      alert(`Failed to load. First, connect the MetaMask.`);
      console.error(error);
    }
  };

  isOwner = (info, account) => {
    let res;
    const owner = info.owner;
    owner.toLowerCase() === account.toLowerCase()
      ? (res = true)
      : (res = false);
    return res;
  };

  runExample = async () => {
    const { accounts, contract, ethereum, web3 } = this.state;

    ethereum.on("accountsChanged", async () => {
      const accounts = await ethereum.request({
        method: "eth_accounts",
      });
      if (!accounts || !accounts[0]) window.location.reload();
      const tokenBalance = await Lib.getTokenBalance(contract, accounts[0]);
      const balance = await Lib.getBalance(web3, accounts[0]);
      const info = await Lib.getInfo(contract);
      const ownership = this.isOwner(info, accounts[0]);
      this.setState({
        accounts: accounts,
        balance,
        tokenBalance,
        info,
        ownership,
      });
    });

    ethereum.on("chainChanged", (_chainId) => window.location.reload());
    ethereum.on("disconnect", () => window.location.reload());

    // Stores a given value, 5 by default.

    // Get the value from the contract to prove it worked.

    const info = await Lib.getInfo(contract);
    const tokenBalance = await Lib.getTokenBalance(contract, accounts[0]);
    const balance = await Lib.getBalance(web3, accounts[0]);
    const ownership = this.isOwner(info, accounts[0]);

    // Update state with the result.
    this.setState({
      totalSupply: info.totalSupply,
      name: info.name,
      decimals: info.decimals,
      symbol: info.symbol,
      tokenBalance,
      balance,
      totalBurn: info.totalBurn,
      totalFee: info.totalFee,
      startPrice: info.startPrice,
      price: info.price,
      info: info,
      loading: false,
      ownership,
    });
  };

  updateInfo = async () => {
    // console.log('update info');
    const { contract } = this.state;
    this.setState({ loading: true });
    const info = await Lib.getInfo(contract);
    this.setState({ info: info, loading: false });
  };

  updateBalances = async () => {
    // console.log('update balance');
    const { contract, accounts, web3 } = this.state;
    const tokenBalance = await Lib.getTokenBalance(contract, accounts[0]);
    const balance = await Lib.getBalance(web3, accounts[0]);
    this.setState({ balance: balance, tokenBalance: tokenBalance });
  };

  render() {
    const {
      tokenBalance,
      balance,
      contract,
      accounts,
      ethereum,
      info,
      loading,
      ownership,
      users,
    } = this.state;

    if (!ethereum) {
      return (
        <Connect>
          <div className="connect__install">
            <p>
              Loading Web3, accounts, and contract. <br />
              If you do not have MetaMask please install...
            </p>
            <a href="https://metamask.io/download" className="btn-primary">
              Install Metamask
            </a>{" "}
          </div>
        </Connect>
      );
    }
    return (
      <div className="app-layout">
        {ethereum && accounts ? (
          <>
            <Header
              address={accounts[0]}
              addToken={() =>
                Lib.addTokenToWallet(contract, ethereum, LedgityContractAddress)
              }
              balance={balance}
              tokenBalance={tokenBalance}
              info={info}
              users={users}
              updateBalances={() => this.updateBalances()}
            />
            <main>
              <Dashboard
                loading={loading}
                account={accounts[0]}
                info={info}
                ownership={ownership}
                contract={contract}
                tokenBalance={tokenBalance}
                getAddress={() => Lib.getExcluded(contract)}
                getDex={() => Lib.getDex(contract)}
                updateInfo={() => this.updateInfo()}
                updateBalances={() => this.updateBalances()}
              />
            </main>
          </>
        ) : (
          <Connect connect={this.connect} />
        )}
      </div>
    );
  }
}

export default App;

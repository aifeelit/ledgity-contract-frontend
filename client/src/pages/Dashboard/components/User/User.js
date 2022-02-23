import React, { useState } from "react";
import * as Lib from "../../../../ledgityLib";
import ExcludeAddress from "./components/ExcludeAddress";
import DexAccounts from "./components/DexAccounts";

import "./User.scss";

const User = (props) => {
  const [accountInput, setAccountInput] = useState("");
  const [balance, setBalance] = useState(null);
  const [token, setToken] = useState("");
  const [address, setAddress] = useState("");

  const [errorBalance, setErrorBalance] = useState(null);
  const [errorTransfer, setErrorTransfer] = useState(null);

  const getTokenBalance = async () => {
    setErrorBalance(null);
    try {
      const tokenAccountBalance = await Lib.getTokenBalance(
        props.contract,
        accountInput
      );
      setBalance(tokenAccountBalance);
    } catch (error) {
      setErrorBalance(<p> Incorrect address. Please, check it.. </p>);
    }
  };

  const onChange = (event) => {
    setErrorBalance(null);
    setErrorTransfer(null);
    switch (event.target.name) {
      case "account":
        return setAccountInput(event.target.value);
      case "token":
        return setToken(event.target.value);
      case "address":
        return setAddress(event.target.value);
      default:
        break;
    }
  };

  const transferTokens = async (event) => {
    event.preventDefault();
    setErrorTransfer(null);

    if(Number(token) > Number(props.tokenBalance)) {
      return setErrorTransfer(<p> The transfer amount is greater than your Token balance.  </p>)
    }

    try {
      await Lib.transfer(props.contract, props.account, address, token);
      props.updateInfo();
      props.updateBalances();

      setToken("");
      setAddress("");
    } catch (error) {
      // console.log(error);
      if(error.arg === 'amount') {
        return setErrorTransfer(<p> The transfer amount is greater than the maximum allowed transaction value.  </p>)
      }
      if(error.arg === 'recipient') {
        return setErrorTransfer(<p> Incorrect recipient address.  </p>)
      }
      if (error.code === 4001) {
        return setErrorTransfer(<p>Transaction signature was denied.</p>);
      }
      setErrorTransfer(<p> Transfer attempt more than once every 15 minutes </p>);
    }
  };

  return (
    <div className="user">
      <h2 className="title"> User </h2>
      <div className="user__block">
        <div className="user__item">
          <h2> Get the balance of the Address: </h2>
          <div className="user__fields">
            <div className="user__field field">
              <input
                type="text"
                placeholder="Enter account address"
                name="account"
                className="field__input"
                value={accountInput}
                onChange={onChange}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={getTokenBalance}
              >
                Get balance
              </button>
              <div className="error-field"> {errorBalance} </div>
            </div>
            <div className="user__balance">
              <span> Account balance: </span>
              <h2> {balance || "0"} LTY</h2>
            </div>
          </div>
        </div>

        <div className="user__item columns">
          <ExcludeAddress getAddress={props.getAddress} />
          <DexAccounts getDex={props.getDex} />
        </div>

        <div className="user__item">
          <h2> Transfer tokens: </h2>
          <div className="user__field field">
            <form className="user__form" onSubmit={transferTokens}>
              <input
                type="number"
                placeholder="Number of tokens"
                name="token"
                className="field__input"
                value={token}
                onChange={onChange}
              />
              <input
                type="text"
                placeholder="Address"
                name="address"
                className="field__input"
                value={address}
                onChange={onChange}
              />
              <button type="submit" className="btn-primary">
                Transfer
              </button>
              <div className="error-field"> {errorTransfer} </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default User;

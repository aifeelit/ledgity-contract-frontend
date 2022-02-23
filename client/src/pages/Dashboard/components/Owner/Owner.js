import React, { useState } from "react";

import "./Owner.scss";
import * as Lib from "../../../../ledgityLib";

const Owner = ({ contract, account, updateInfo, ownership }) => {
  const [price, setPrice] = useState("");
  const [token, setToken] = useState("");
  const [dex, setDex] = useState("");
  const [accountInput, setAccountInput] = useState("");

  const [errorPrice, setErrorPrice] = useState(null);
  const [errorDex, setErrorDex] = useState(null);
  const [errorToken, setErrorToken] = useState(null);
  const [errorAccount, setErrorAccount] = useState(null);

  const onChange = (event) => {
    setErrorPrice(null);
    setErrorDex(null);
    setErrorToken(null);
    setErrorAccount(null);

    switch (event.target.name) {
      case "price":
        return setPrice(event.target.value);
      case "token":
        return setToken(event.target.value);
      case "dex":
        return setDex(event.target.value);
      case "account":
        return setAccountInput(event.target.value);
      default:
        break;
    }
  };

  const applyPrice = async (event) => {
    event.preventDefault();
    setErrorPrice(null);

    try {
      await Lib.setPrice(contract, account, price);
      setPrice("");
      updateInfo();
    } catch (error) {
      if (error.code === 4001) {
        return setErrorPrice(<p>Transaction signature was denied.</p>);
      }
      setErrorPrice(<p>Something went wrong..</p>);
    }
  };

  const burnToken = async (event) => {
    event.preventDefault();
    setErrorToken(null);
    try {
      await Lib.burn(contract, account, token);
      setToken("");
      updateInfo();
    } catch (error) {
      if (error.code === 4001) {
        return setErrorToken(<p>Transaction signature was denied.</p>);
      }
      setErrorToken(<p> Incorrect token. </p>);
    }
  };

  const addDex = async (event) => {
    event.preventDefault();
    setErrorDex(null);
    try {
      const allDex = await Lib.getDex(contract);
      if (allDex.indexOf(dex) === -1) {
        await Lib.setDex(contract, account, dex);
        setDex("");
      } else {
        setErrorDex(<p> Such address already exists. </p>);
      }
    } catch (error) {
      if (error.code === 4001) {
        return setErrorToken(<p>Transaction signature was denied.</p>);
      }
      setErrorDex(<p> Incorrect address. Please, check it.. </p>);
    }
  };

  const excludeAccount = async () => {
    setErrorAccount(null);
    try {
      const allExcluded = await Lib.getExcluded(contract);
      if (allExcluded.indexOf(accountInput) === -1) {
        await Lib.excludeAccount(contract, account, accountInput);
        setAccountInput("");
      } else {
        setErrorAccount(<p> Such account is already excluded. </p>);
      }
    } catch (error) {
      if (error.code === 4001) {
        return setErrorAccount(<p>Transaction signature was denied.</p>);
      }
      setErrorAccount(<p> Incorrect account. Please, check it.. </p>);
    }
  };

  const includeAccount = async () => {
    setErrorAccount(null);
    try {
      await Lib.includeAccount(contract, account, accountInput);
      setAccountInput("");
    } catch (error) {
      if (error.code === 4001) {
        return setErrorAccount(<p>Transaction signature was denied.</p>);
      }
      setErrorAccount(<p> Incorrect account. Please, check it.. </p>);
    }
  };

  return (
    <div className="owner">
      {ownership ? (
        <h2 className="title"> Owner </h2>
      ) : (
        <div className="owner__head">
          <h2 className="title"> Owner </h2>
          <p>(Only for contract Owner)</p>
        </div>
      )}

      <div className="owner__block">
        <div className="owner__item commission">
          <h2> Get the balance of the Address: </h2>
          <div className="owner__fields">
            <form className="owner__field field" onSubmit={applyPrice}>
              <label className="field__label" htmlFor="price">
                Set a price:
              </label>
              <input
                type="number"
                name="price"
                className={ownership ? "field__input" : "field__input disabled"}
                disabled={!ownership}
                placeholder="Enter price"
                value={price}
                onChange={onChange}
              />
              <button
                type="submit"
                className={ownership ? "btn-primary" : "btn-primary disabled"}
                disabled={!ownership}
              >
                Set
              </button>
              <div className="error-field"> {errorPrice} </div>
            </form>
            <form className="owner__field field" onSubmit={burnToken}>
              <label className="field__label" htmlFor="token">
                Burn token:
              </label>
              <input
                type="number"
                name="token"
                className={ownership ? "field__input" : "field__input disabled"}
                disabled={!ownership}
                value={token}
                onChange={onChange}
              />
              <button
                type="submit"
                className={ownership ? "btn-primary" : "btn-primary disabled"}
                disabled={!ownership}
              >
                Burn
              </button>
              <div className="error-field"> {errorToken} </div>
            </form>
            <form className="owner__field field" onSubmit={addDex}>
              <input
                type="text"
                placeholder="Enter address"
                name="dex"
                className={ownership ? "field__input" : "field__input disabled"}
                disabled={!ownership}
                value={dex}
                onChange={onChange}
              />
              <button
                type="submit"
                className={ownership ? "btn-primary" : "btn-primary disabled"}
                disabled={!ownership}
              >
                {" "}
                Add DEX{" "}
              </button>
              <div className="error-field">{errorDex}</div>
            </form>
          </div>
        </div>
        <div className="owner__item">
          <h2> Account: </h2>
          <div className="owner__fields">
            <div className="owner__field field full">
              <input
                type="text"
                name="account"
                className={ownership ? "field__input" : "field__input disabled"}
                disabled={!ownership}
                value={accountInput}
                onChange={onChange}
              />
              <button
                type="button"
                className={ownership ? "btn-primary" : "btn-primary disabled"}
                disabled={!ownership}
                onClick={excludeAccount}
              >
                Exclude account
              </button>
              <button
                type="button"
                className={ownership ? "btn-primary" : "btn-primary disabled"}
                disabled={!ownership}
                onClick={includeAccount}
              >
                Include account
              </button>
              <div className="error-field"> {errorAccount} </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Owner;

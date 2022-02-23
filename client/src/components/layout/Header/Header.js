import React, {useEffect, useState} from "react";
import { Modal } from "../index";
import { Contract } from "../index";

import "./Header.scss";

const Header = ({
  tokenBalance = "",
  balance = "",
  addToken,
  address,
  info,
  updateBalances,
  users,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    updateBalances();
    const interval = setInterval(() => {
      updateBalances();
    }, 10000);

    return () => clearInterval(interval)
  }, []);

  const showModal = () => {
    setVisible(true);
  };

  const closeModal = () => {
    setVisible(false);
  };

  return (
    <>
      <header className="app-header">
        <div className="container">
          <div className="app-header__info">
            <div className="balance">
              <p className="balance__title">Balance:</p>
              <div className="balance__btns">
                <div className="balance__item">
                  <div className="balance__token">
                    <img src="/images/lty.svg" alt="lty" />
                    <span> LTY </span>
                  </div>
                  <div className="balance__price dropdown">
                    <div className="dropdown-btn">
                      {tokenBalance.length > 9
                          ? `${tokenBalance.substring(0, 9)}...`
                          : tokenBalance
                      }
                    </div>
                    {tokenBalance.length > 9 &&
                    <div className="dropdown-content">
                      <p> { tokenBalance }</p>
                    </div>
                    }
                  </div>
                </div>
                <div className="balance__item">
                  <div className="balance__token">
                    <img src="/images/eth.svg" alt="eth" />
                    <span> ETH </span>
                  </div>
                  <div className="balance__price dropdown">
                    <div className="dropdown-btn">
                      {balance.length > 9
                          ? `${balance.substring(0, 9)}...`
                          : balance
                      }
                    </div>
                    {balance.length > 9 &&
                    <div className="dropdown-content">
                      <p> { balance }</p>
                    </div>
                    }
                  </div>
                </div>
              </div>
            </div>
            <div className="app-header__contract">
              <button
                type="button"
                className="btn-secondary"
                onClick={showModal}
              >
                Contract details
              </button>
            </div>
          </div>
          <div className="app-header__btns">
            <div className="app-header__users">
              <p> Online users:  </p>
              <p className="field__input">
                {users || <span className="no-connect"> no connect </span>}
              </p>
            </div>
            <div className="app-header__btns-wrap">
              <button type="button" className="btn-secondary" onClick={addToken}>
                Add LTY to wallet
              </button>
              <div className="app-header__account">
                {`${address.substring(0, 6)}...${address.substring(
                    address.length - 4
                )}`}
              </div>
            </div>
          </div>
        </div>
      </header>
      {visible && (
        <Modal close={closeModal} title="Contract details:">
          <Contract info={info} />
        </Modal>
      )}
    </>
  );
};

export default Header;

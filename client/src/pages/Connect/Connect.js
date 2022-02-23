import React from "react";

import "./Connect.scss";

const Connect = (props) => {
  const info = (
      <>
        <button type="button" className="btn-primary" onClick={props.connect}>
          {" "}
          Connect Metamask{" "}
        </button>
        <p> please connect first </p>
      </>
  )
  return (
    <div className="connect">
      <div className="container">
        <img src="/images/blockchain.svg" alt="Blockchain" />
        <div className="connect__info">
          {props.children
              ? props.children
              : info
          }
        </div>
        <img src="/images/prive.svg" alt="prive" />
      </div>
    </div>
  );
};
export default Connect;

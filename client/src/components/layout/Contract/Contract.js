import React from 'react';

import './Contract.scss';

const Contract = ({ info }) => {
    const { owner, symbol, name, totalSupply, decimals, allSupply, maxTokenTx, totalFee, totalBurn, startPrice, price  } = info;

    const renderTokenSymbol = (symbol) => {
        switch (symbol) {
            case 'LTY': return <img src="/images/lty.svg" alt="lty"/>
            case 'ETH': return <img src="/images/eth.svg" alt="eth" />
            default: break;
        }
    }

    const tokenSymbol = renderTokenSymbol(info.symbol);

    return (
        <div className="contract">
            <div className="contract__owner">
                <div className="contract__image">
                    <img src="/images/user.svg" alt="owner"/>
                </div>
                <div className="contract__owner-info">
                    <p className="contract__address"> { owner } </p>
                    <p className="contract__note"> Owner </p>
                </div>
            </div>
            <div className="contract__token-info">
                <div className="contract__token">
                    {tokenSymbol}
                    <span> {symbol} </span>
                    <span className="contract__note"> {`${name.toLowerCase()} token`} </span>
                </div>
                <div className="contract__decimals">
                    <p> Decimals: {decimals} </p>
                </div>
            </div>
            <div className="contract__form">
                <div className="contract__field">
                    <p className="contract__label bold"> How much has been released token: </p>
                    <div className="contract__input"> {allSupply} </div>
                </div>
                <div className="contract__field">
                    <p className="contract__label bold"> Total supply: </p>
                    <div className="contract__input"> {totalSupply} </div>
                </div>
                <div className="contract__field combine">
                    <p className="contract__label"> Transaction size max: </p>
                    <div className="contract__input half"> {maxTokenTx} </div>
                    <p className="contract__note"> 0,1 % of total supply </p>
                </div>
                <div className="contract__field half">
                    <p className="contract__label green"> Total commission: </p>
                    <div className="contract__input"> {totalFee} </div>
                </div>
                <div className="contract__field half">
                    <p className="contract__label red"> Tokens burned: </p>
                    <div className="contract__input"> {totalBurn} </div>
                </div>
                <div className="contract__field half">
                    <p className="contract__label"> Current price: </p>
                    <div className="contract__input"> {price} </div>
                </div>
                <div className="contract__field half">
                    <p className="contract__label"> Starting price: </p>
                    <div className="contract__input"> {startPrice} </div>
                </div>
            </div>
        </div>
    )
};

export default Contract;
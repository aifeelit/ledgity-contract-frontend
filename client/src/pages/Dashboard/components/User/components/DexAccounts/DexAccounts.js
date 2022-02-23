import React, { useState } from "react";
import {Modal} from "../../../../../../components/layout";

const DexAccounts = ({ getDex }) => {
    const [visible, setVisible] = useState(false);
    const [address, setAddress] = useState([]);

    const closeModal = () => {
        setVisible(false);
    };

    const renderModal = async () => {
        getDex().then(res => {
            setAddress(res);
            setVisible(true);
        });
    };

    return (
        <div className="user__column">
            <h2> Get DEX accounts: </h2>
            <button type="button" className="btn-primary" onClick={renderModal}>
                Get DEX
            </button>
            {visible && (
                <Modal
                    title="DEX addresses:"
                    close={closeModal}
                >
                    <div className="addresses-list">
                        {address.length > 0
                            ? (
                                address.map((item, index) => {
                                    return (
                                        <div
                                            className="addresses-list__item"
                                            key={index+1}
                                        >
                                            <span>{index+1}.</span>
                                            { item }
                                        </div>
                                    )
                                })
                            ) : (
                                <p style={{textAlign: 'center'}}> No Dex addresses now </p>
                            )
                        }
                    </div>
                </Modal>
            )}
        </div>
    )
}

export default DexAccounts;
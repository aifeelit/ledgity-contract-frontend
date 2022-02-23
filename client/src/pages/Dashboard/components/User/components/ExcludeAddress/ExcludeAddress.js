import React, {useState} from 'react';
import { Modal } from "../../../../../../components/layout";

const ExcludeAddress = ({ getAddress }) => {
    const [visible, setVisible] = useState(false);
    const [address, setAddress] = useState([]);

    const closeModal = () => {
        setVisible(false);
    };

    const renderModal = async () => {
        getAddress().then(res => {
            setAddress(res);
            setVisible(true);
        });
    };

    return (
        <div className="user__column">
            <h2> Get excluded accounts: </h2>
            <button type="button" className="btn-primary" onClick={renderModal}>
                Get address
            </button>
            {visible && (
                <Modal
                    title="Excluded addresses:"
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
                                <p style={{textAlign: 'center'}}> No excluded addresses now </p>
                            )
                        }
                    </div>
                </Modal>
            )}
        </div>
    )
}

export default ExcludeAddress;
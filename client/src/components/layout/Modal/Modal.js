import React from 'react';

import './Modal.scss';

const Modal = ({ close, children, title }) => {
    return (
        <>
            <div className="overlay-bg" />
            <div className="modal">
                <h2 className="modal__title"> {title} </h2>
                <div type="button" onClick={close} className="close-btn">
                    <img src="/images/close.svg" alt="Close"/>
                </div>
                <div className="modal__content">
                    {children}
                </div>
            </div>
        </>
    )
}

export default Modal;
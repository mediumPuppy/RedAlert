import React from 'react';
import styled from 'styled-components';

const COLORS = {
    sovietRed: '#ff0000',
    alliedBlue: '#0000ff',
    oreYellow: '#ffff00',
    darkGray: '#333333',
    lightGray: '#808080',
    white: '#ffffff',
    black: '#000000',
    green: '#006400',
};

const PageWrapper = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background-color: ${COLORS.darkGray};
    font-family: 'Press Start 2P', cursive;
    color: ${COLORS.white};
    text-align: center;
    padding: 20px;
`;

const Title = styled.h1`
    font-size: 36px;
    color: ${COLORS.sovietRed};
    text-shadow: 4px 4px 0 ${COLORS.black}, -4px -4px 0 ${COLORS.black};
    margin-bottom: 40px;
`;

const Button = styled.button`
    background-color: ${props => props.color || COLORS.alliedBlue};
    color: ${COLORS.white};
    border: 4px solid ${COLORS.black};
    padding: 16px 32px;
    font-size: 24px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'Press Start 2P', cursive;
    margin: 10px;
    image-rendering: pixelated;

    &:hover {
        background-color: ${COLORS.oreYellow};
        color: ${COLORS.black};
        transform: scale(1.1);
    }

    &:active {
        transform: scale(0.95);
    }
`;

const BackButton = styled.button`
    background-color: ${COLORS.lightGray};
    color: ${COLORS.white};
    border: 2px solid ${COLORS.black};
    padding: 8px 16px;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'Press Start 2P', cursive;
    margin-top: 30px;
    image-rendering: pixelated;

    &:hover {
        background-color: ${COLORS.darkGray};
        transform: scale(1.05);
    }

    &:active {
        transform: scale(0.95);
    }
`;

const GameMode: React.FC = () => {
    const handleMultiplayerClick = () => {
        window.location.href = '/play?mode=multiplayer';
    };

    const handleBackClick = () => {
        window.location.href = '/';
    };

    return (
        <PageWrapper>
            <Title>Select Game Mode</Title>
            <Button color={COLORS.alliedBlue} onClick={handleMultiplayerClick}>Play Multiplayer</Button>
            <BackButton onClick={handleBackClick}>Back</BackButton>
        </PageWrapper>
    );
};

export default GameMode; 
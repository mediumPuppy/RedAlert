import React from 'react';
import styled from 'styled-components';

// Define some pixel-art inspired colors and constants
const COLORS = {
  sovietRed: '#ff0000',
  alliedBlue: '#0000ff',
  oreYellow: '#ffff00',
  darkGray: '#333333',
  lightGray: '#808080',
  white: '#ffffff',
  black: '#000000',
};

// Styled components with pixel-art vibe
const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: ${COLORS.darkGray};
  font-family: 'Press Start 2P', cursive; /* Retro pixel font */
  color: ${COLORS.white};
  text-align: center;
  padding: 20px;
`;

const Title = styled.h1`
  font-size: 48px;
  color: ${COLORS.sovietRed};
  text-shadow: 4px 4px 0 ${COLORS.black}, -4px -4px 0 ${COLORS.black};
  margin-bottom: 20px;
  image-rendering: pixelated; /* Ensures crisp edges */
`;

const Description = styled.p`
  font-size: 16px;
  max-width: 600px;
  line-height: 1.5;
  color: ${COLORS.lightGray};
  margin-bottom: 40px;
  text-shadow: 2px 2px 0 ${COLORS.black};
`;

const PlayButton = styled.button`
  background-color: ${COLORS.alliedBlue};
  color: ${COLORS.white};
  border: 4px solid ${COLORS.black};
  padding: 16px 32px;
  font-size: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
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

const Footer = styled.footer`
  position: absolute;
  bottom: 20px;
  font-size: 12px;
  color: ${COLORS.lightGray};
  text-shadow: 1px 1px 0 ${COLORS.black};
`;

const Home: React.FC = () => {
  const handlePlayClick = () => {
    // Navigate to the game mode selection page
    window.location.href = '/game-mode';
  };

  return (
    <PageWrapper>
      <Title>Red Alert 25</Title>
      <Description>
        A gritty, Cold War-inspired RTS with a retro '90s vibe. Soviets and Allies clash in a tense,
        alternate history. Fuel the chaos of tanks, infantry, and ore harvesters battling across rugged maps.
      </Description>
      <PlayButton onClick={handlePlayClick}>Play Now</PlayButton>
      <Footer>Built by Jefferson Lambert - 2025 - Original credit for the game goes to Electronic Arts</Footer>
    </PageWrapper>
  );
};

export default Home; 
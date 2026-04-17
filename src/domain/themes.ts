import type { ThemeId } from '../types'

export interface ThemeStageDefinition {
  key: string
  name: string
  hazardLabel: string
  bossLabel: string
  sisterName: string
  palette: {
    backdrop: string
    waterGlow: string
    reefGlow: string
    hazardGlow: string
  }
}

export interface AdventureTheme {
  id: ThemeId
  name: string
  intro: string
  stageDefinitions: ThemeStageDefinition[]
  palette: {
    shell: string
    shellStrong: string
    oceanDeep: string
    oceanMid: string
    pearl: string
    bubble: string
    seafoam: string
  }
  copy: {
    modeLabel: string
    winTitle: string
    loseTitle: string
    practiceTitle: string
    practiceSubtitle: string
  }
}

export const MERMAID_THEME: AdventureTheme = {
  id: 'mermaid',
  name: 'Mermaid Adventure',
  intro: 'Solve each equation to slip past sea dangers, defeat the boss, and free a trapped sister at every stage.',
  palette: {
    shell: '#fef3c7',
    shellStrong: '#f59e0b',
    oceanDeep: '#0b3558',
    oceanMid: '#0f766e',
    pearl: '#fff7ed',
    bubble: 'rgba(236, 253, 245, 0.72)',
    seafoam: '#d1fae5',
  },
  copy: {
    modeLabel: 'Storybook ocean quest',
    winTitle: 'All sisters are free',
    loseTitle: 'The tide turned this time',
    practiceTitle: 'Mermaid Rescue Training',
    practiceSubtitle: 'Build a 15-answer pearl streak to strengthen the reef gate.',
  },
  stageDefinitions: [
    {
      key: 'reef-sprint',
      name: 'Reef Sprint',
      hazardLabel: 'Silvertip sharks',
      bossLabel: 'Queen Shark',
      sisterName: 'Coral',
      palette: {
        backdrop: 'linear-gradient(180deg, rgba(255, 248, 251, 0.98), rgba(231, 249, 255, 0.98))',
        waterGlow: 'rgba(251, 207, 232, 0.5)',
        reefGlow: 'rgba(125, 211, 252, 0.3)',
        hazardGlow: 'rgba(96, 165, 250, 0.22)',
      },
    },
    {
      key: 'urchin-garden',
      name: 'Urchin Garden',
      hazardLabel: 'Spiky urchins',
      bossLabel: 'Urchin Empress',
      sisterName: 'Pearla',
      palette: {
        backdrop: 'linear-gradient(180deg, rgba(255, 251, 243, 0.98), rgba(236, 253, 245, 0.98))',
        waterGlow: 'rgba(253, 224, 71, 0.26)',
        reefGlow: 'rgba(167, 243, 208, 0.35)',
        hazardGlow: 'rgba(248, 113, 113, 0.2)',
      },
    },
    {
      key: 'pirate-cove',
      name: 'Pirate Cove',
      hazardLabel: 'Storm pirates',
      bossLabel: 'Captain Blackwake',
      sisterName: 'Marina',
      palette: {
        backdrop: 'linear-gradient(180deg, rgba(255, 247, 240, 0.98), rgba(238, 242, 255, 0.98))',
        waterGlow: 'rgba(196, 181, 253, 0.3)',
        reefGlow: 'rgba(252, 211, 77, 0.28)',
        hazardGlow: 'rgba(251, 146, 60, 0.22)',
      },
    },
  ],
}

export function getAdventureTheme(themeId: ThemeId = 'mermaid'): AdventureTheme {
  switch (themeId) {
    case 'mermaid':
      return MERMAID_THEME
  }
}

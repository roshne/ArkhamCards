// Web-only startup work that native builds get from the platform (see prepareWeb.ts).
import { Alert } from 'react-native';
import * as Font from 'expo-font';
import WebAlert from '@blazejkustra/react-native-alert';
import type { Persistor } from 'redux-persist';

// react-native-web's Alert.alert does nothing, which silently drops every confirmation prompt.
// This package (already a dependency) draws them as an in-page <dialog>.
Alert.alert = WebAlert.alert;

// Native builds embed these fonts at build time (expo-font plugin); the browser has to load
// them. Family names are the file names, which is what the app asks for off iOS, plus the
// iOS-style family names a few components use.
const FONTS = {
  'AboutDead': require('../../assets/AboutDead.ttf'),
  'Alegreya-Bold': require('../../assets/Alegreya-Bold.ttf'),
  'Alegreya-BoldItalic': require('../../assets/Alegreya-BoldItalic.ttf'),
  'Alegreya-ExtraBold': require('../../assets/Alegreya-ExtraBold.ttf'),
  'Alegreya-ExtraBoldItalic': require('../../assets/Alegreya-ExtraBoldItalic.ttf'),
  'Alegreya-Italic': require('../../assets/Alegreya-Italic.ttf'),
  'Alegreya-Medium': require('../../assets/Alegreya-Medium.ttf'),
  'Alegreya-MediumItalic': require('../../assets/Alegreya-MediumItalic.ttf'),
  'Alegreya-Regular': require('../../assets/Alegreya-Regular.ttf'),
  'AlegreyaSC-Medium': require('../../assets/AlegreyaSC-Medium.ttf'),
  'AnkeCalligraphicFG': require('../../assets/AnkeCalligraphicFG.ttf'),
  'Arkhamic': require('../../assets/Arkhamic.ttf'),
  'Caveat': require('../../assets/Caveat.ttf'),
  'Conkordia': require('../../assets/Conkordia.ttf'),
  'DMSerifDisplay-Italic': require('../../assets/DMSerifDisplay-Italic.ttf'),
  'DMSerifDisplay-Regular': require('../../assets/DMSerifDisplay-Regular.ttf'),
  'TT2020StyleE-Regular': require('../../assets/TT2020StyleE-Regular.ttf'),
  'Teutonic RU': require('../../assets/Teutonic RU.ttf'),
  'Teutonic': require('../../assets/Teutonic.ttf'),
  'ages': require('../../assets/ages.ttf'),
  'alice': require('../../assets/alice.ttf'),
  'app': require('../../assets/app.ttf'),
  'arkhamicons': require('../../assets/arkhamicons.ttf'),
  'arkhamslim': require('../../assets/arkhamslim.ttf'),
  'blood': require('../../assets/blood.ttf'),
  'carcosa': require('../../assets/carcosa.ttf'),
  'cardicons': require('../../assets/cardicons.ttf'),
  'circle': require('../../assets/circle.ttf'),
  'circusexmortis': require('../../assets/circusexmortis.ttf'),
  'core_2026': require('../../assets/core_2026.ttf'),
  'coreset': require('../../assets/coreset.ttf'),
  'cost': require('../../assets/cost.ttf'),
  'cyclopean': require('../../assets/cyclopean.ttf'),
  'dark_matter': require('../../assets/dark_matter.ttf'),
  'dreameaters': require('../../assets/dreameaters.ttf'),
  'drowned': require('../../assets/drowned.ttf'),
  'dunwich': require('../../assets/dunwich.ttf'),
  'edge': require('../../assets/edge.ttf'),
  'forgotten': require('../../assets/forgotten.ttf'),
  'hemlock': require('../../assets/hemlock.ttf'),
  'innsmouth': require('../../assets/innsmouth.ttf'),
  'oz': require('../../assets/oz.ttf'),
  'scarlet': require('../../assets/scarlet.ttf'),
  'standalone': require('../../assets/standalone.ttf'),
  'tokens': require('../../assets/tokens.ttf'),
  'Alegreya': require('../../assets/Alegreya-Regular.ttf'),
  'Alegreya SC': require('../../assets/AlegreyaSC-Medium.ttf'),
  'DM Serif Display': require('../../assets/DMSerifDisplay-Regular.ttf'),
};

// redux-persist saves whole slices from memory and never re-reads storage, so two open tabs
// would overwrite each other's decks and campaigns. The newest tab wins: older tabs stop saving
// and cover themselves with a notice.
function guardSingleTab(persistor: Persistor) {
  const channel = new BroadcastChannel('arkhamcards-tabs');
  channel.onmessage = () => {
    persistor.pause();
    channel.close();
    const notice = document.createElement('div');
    notice.textContent = 'Arkham Cards is open in another tab, so this tab no longer saves changes. Reload this tab to use it here instead.';
    Object.assign(notice.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px', textAlign: 'center',
      background: 'rgba(0, 0, 0, 0.85)', color: '#fff', font: '18px sans-serif',
    });
    document.body.appendChild(notice);
  };
  channel.postMessage('opened');
}

export default function prepareWeb(persistor: Persistor): Promise<void> {
  guardSingleTab(persistor);
  return Font.loadAsync(FONTS);
}

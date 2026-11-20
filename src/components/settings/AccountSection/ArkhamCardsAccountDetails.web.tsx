import React, { useContext, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { t } from 'ttag';

import space from '@styles/space';
import StyleContext from '@styles/StyleContext';
import DeckPickerStyleButton from '@components/deck/controls/DeckPickerStyleButton';
import { ShowAlert } from '@components/deck/dialogs';
import { storageMode } from '@lib/persistStorage.web';

interface Props {
  showAlert: ShowAlert;
}

// Web variant: the account is the Cloudflare Access sign-in, not an Arkham Cards (Firebase)
// account, which can't sign in from a browser. Shows who is signed in and where data is saved.
export default function ArkhamCardsAccountDetails(_props: Props) {
  const { typography } = useContext(StyleContext);
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    storageMode.then(
      (mode) => setEmail(mode.kind === 'server' ? mode.email : null),
      () => setEmail(null)
    );
  }, []);
  if (email === undefined) {
    return null;
  }
  return (
    <View style={space.paddingTopS}>
      <DeckPickerStyleButton
        icon="name"
        editable={false}
        title={t`Signed in as`}
        valueLabel={email ?? t`Not signed in`}
        first
        last
      />
      <View style={[space.paddingTopS, space.paddingSideS]}>
        <Text style={typography.text}>
          { email ?
            t`Your decks, campaigns and settings are saved to this account, so they follow you to any device.` :
            t`Your decks, campaigns and settings are saved in this browser only.` }
        </Text>
      </View>
    </View>
  );
}

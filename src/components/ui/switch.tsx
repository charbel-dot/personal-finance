import { Switch as GlassSwitch } from 'glisse';
import type * as React from 'react';

type Props = Omit<React.ComponentProps<typeof GlassSwitch>, 'onChange'>;

/** Liquid glass switch (glisse): `checked` + `onCheckedChange`, role="switch". */
function Switch(props: Props) {
  return <GlassSwitch data-slot="switch" {...props} />;
}

export { Switch };

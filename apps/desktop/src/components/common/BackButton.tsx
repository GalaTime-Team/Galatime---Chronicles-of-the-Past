import { ChevronLeft } from '../../assets/GalatimeIcon';
import { useControlListener } from '../../context/GameContext';
import CommonButton from './CommonButton';

interface BackButtonProps {
  label: string;
  onClick: () => void;
}

export function BackButton({ label, onClick }: BackButtonProps) {
  // `deny` is the chronicle's universal "leave this screen", exactly like clicking the
  // button. It is muted while a popup is open, so the popup cancels itself instead of the
  // same press also stepping out of the screen that opened it.
  useControlListener({ deny: onClick }, { mutedByModal: true });

  return (
    <CommonButton
      variant="ghost"
      size="sm"
      icon={<ChevronLeft />}
      onPress={onClick}
      className="w-fit uppercase tracking-[0.18em] py-0.5"
    >
      {label}
    </CommonButton>
  );
}

import { ChevronLeft } from '../../assets/GalatimeIcon';
import CommonButton from './CommonButton';

interface BackButtonProps {
  label: string;
  onClick: () => void;
}

export function BackButton({ label, onClick }: BackButtonProps) {
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

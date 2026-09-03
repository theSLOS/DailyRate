/**
 * Inline reveal-a-form report button for a post or comment: tap to open a
 * reason field, submit to file the report.
 */
import { useSubmitReport, ReportTargetType } from '@/hooks/useReports';
import { JSX, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Button } from '@/components/ui/Button';

export type ReportButtonProps = {
  reporterId: string | undefined;
  targetType: ReportTargetType;
  targetId: string;
};

/** Renders a "Report" button that reveals a reason field and submits a report. */
export function ReportButton({ reporterId, targetType, targetId }: ReportButtonProps): JSX.Element {
  const [isReporting, setIsReporting] = useState(false);
  const [reason, setReason] = useState('');
  const submitReport = useSubmitReport();

  const handleSubmit = (): void => {
    if (!reporterId || reason.trim() === '') {
      console.warn('Reporter ID and reason are required to submit a report');
      return;
    }
    submitReport.mutate(
      { reporterId, targetType, targetId, reason },
      {
        onSuccess: () => {
          setReason('');
          setIsReporting(false);
        },
      }
    );
  };

  if (!isReporting) {
    return <Button label="Report" onPress={() => setIsReporting(true)} disabled={!reporterId} />;
  }

  return (
    <View>
      <TextInput value={reason} onChangeText={setReason} placeholder="Reason for reporting" />
      {submitReport.isError && <Text>Couldn't submit report. Try again.</Text>}
      <Button
        label={submitReport.isPending ? 'Submitting…' : 'Submit report'}
        onPress={handleSubmit}
        disabled={reason.trim() === '' || submitReport.isPending}
      />
      <Button
        label="Cancel"
        onPress={() => setIsReporting(false)}
        disabled={submitReport.isPending}
      />
    </View>
  );
}

import { useSubmitReport, ReportTargetType } from '@/hooks/useReports';
import { JSX, useState } from 'react';
import { Pressable, View, Text, TextInput } from 'react-native';

export type ReportButtonProps = {
  reporterId: string | undefined;
  targetType: ReportTargetType;
  targetId: string;
};

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
    return (
      <Pressable onPress={() => setIsReporting(true)} disabled={!reporterId}>
        <Text>Report</Text>
      </Pressable>
    );
  }

  return (
    <View>
      <TextInput value={reason} onChangeText={setReason} placeholder="Reason for reporting" />
      {submitReport.isError && <Text>Couldn't submit report. Try again.</Text>}
      <Pressable
        onPress={handleSubmit}
        disabled={reason.trim() === '' || submitReport.isPending}
      >
        <Text>{submitReport.isPending ? 'Submitting…' : 'Submit report'}</Text>
      </Pressable>
      <Pressable onPress={() => setIsReporting(false)} disabled={submitReport.isPending}>
        <Text>Cancel</Text>
      </Pressable>
    </View>
  );
}

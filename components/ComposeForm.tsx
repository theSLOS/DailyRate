import { JSX, useState } from 'react';
import { Image, Pressable, Text, TextInput, View, Switch } from 'react-native';
import { pickAndCompressImage } from '@/utils/pickAndCompressImage';
import { ANONYMOUS_POST_WARNING } from '@/constants/posts';
import { Button } from '@/components/ui/Button';

type ComposeFormProps = {
  initialRating?: number;
  initialMessage?: string;
  initialPhotoDisplayUri?: string | null; // already a viewable signed URL, resolved by the caller
  submitting: boolean;
  blocked?: boolean;
  blockedLabel?: string;
  initialIsAnonymous?: boolean;
  onSubmit: (values: {
    rating: number;
    message: string;
    newPhotoLocalUri: string | null;
    isAnonymous: boolean;
  }) => void;
};

export function ComposeForm(props: ComposeFormProps): JSX.Element {
  const [rating, setRating] = useState(props.initialRating ?? 5);
  const [message, setMessage] = useState(props.initialMessage ?? '');
  const [newPhotoLocalUri, setNewPhotoLocalUri] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(props.initialIsAnonymous ?? false);
  const displayedPhotoUri = newPhotoLocalUri ?? props.initialPhotoDisplayUri ?? null;

  async function handlePickPhoto(): Promise<void> {
    const uri = await pickAndCompressImage();
    if (uri) {
      setNewPhotoLocalUri(uri);
    }
  }

  function handleSubmit(): void {
    props.onSubmit({ rating, message, newPhotoLocalUri, isAnonymous });
  }

  return (
    <View className="flex-1 p-6">
      {/* rating picker: 10 pressable buttons, 1 through 10 */}
      <View className="flex-row flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <Pressable
            key={n}
            onPress={() => setRating(n)}
            className={
              n === rating
                ? 'bg-black rounded-full w-10 h-10 items-center justify-center'
                : 'bg-gray-200 rounded-full w-10 h-10 items-center justify-center'
            }
          >
            <Text className={n === rating ? 'text-white' : 'text-black'}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        className="border border-gray-300 rounded-lg p-3 mt-4"
        value={message}
        onChangeText={setMessage}
        maxLength={280}
        multiline
        placeholder="How was your day?"
      />

      {displayedPhotoUri && (
        <Image source={{ uri: displayedPhotoUri }} className="w-full h-48 rounded-lg mt-4" />
      )}

      <Button
        label={displayedPhotoUri ? 'Change photo' : 'Add photo'}
        onPress={handlePickPhoto}
        className="mt-4"
      />

      <View className="flex-row items-center justify-between mt-4">
        <Text>Post anonymously</Text>
        <Switch value={isAnonymous} onValueChange={setIsAnonymous} />
      </View>
      {isAnonymous && <Text className="text-gray-500 mt-2">{ANONYMOUS_POST_WARNING}</Text>}

      <Button
        label={
          props.submitting ? 'Saving...' : (props.blocked === true && props.blockedLabel) || 'Save'
        }
        onPress={handleSubmit}
        disabled={props.submitting || props.blocked === true}
        variant="primary"
        className="mt-6"
      />
    </View>
  );
}

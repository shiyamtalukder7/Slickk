import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />

      <Stack
        initialRouteName="index"
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: {
            backgroundColor: '#07101E',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Slickk',
          }}
        />

        <Stack.Screen
          name="onboarding"
          options={{
            title: 'Student Setup',
          }}
        />

        <Stack.Screen
          name="access"
          options={{
            title: 'Server Access',
          }}
        />

        <Stack.Screen
          name="explore"
          options={{
            title: 'Slickk Dashboard',
            gestureEnabled: false,
          }}
        />

        <Stack.Screen
          name="tutor"
          options={{
            title: 'Slickk Tutor',
          }}
        />

        <Stack.Screen
          name="live-tutor"
          options={{
            title: 'Slickk Live Tutor',
          }}
        />

        <Stack.Screen
          name="routine"
          options={{
            title: 'Daily Routine',
          }}
        />

        <Stack.Screen
          name="parent-portal"
          options={{
            title: 'Parent Portal',
          }}
        />

        <Stack.Screen
          name="weekly-test"
          options={{
            title: 'Weekly Test',
          }}
        />

        <Stack.Screen
          name="twin"
          options={{
            title: 'Learning Twin',
          }}
        />

        <Stack.Screen
          name="camera-learn"
          options={{
            title: 'Learning Materials',
          }}
        />
      </Stack>
    </>
  );
}

import * as Notifications from 'expo-notifications';
import { router, Stack, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    const openNotification = (notification: Notifications.Notification) => {
      const url = notification.request.content.data?.url;
      if (url === '/routine') {
        router.push('/routine' as Href);
      }
    };

    const initialResponse = Notifications.getLastNotificationResponse();
    if (initialResponse?.notification) {
      openNotification(initialResponse.notification);
    }

    const subscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openNotification(response.notification);
      });

    return () => subscription.remove();
  }, []);

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
          name="educator-review"
          options={{
            title: 'Educator Review',
          }}
        />

        <Stack.Screen
          name="learning-plan"
          options={{
            title: 'Personal Learning Plan',
          }}
        />

        <Stack.Screen
          name="assessment-review"
          options={{ title: 'Assessment Review' }}
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
            title: 'Homework & Materials',
          }}
        />
      </Stack>
    </>
  );
}

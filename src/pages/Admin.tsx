import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAdmin } from '@/hooks/useAdmin';
import { supabase } from '@/integrations/supabase/client';
import { Bell, Send, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

export default function Admin() {
  const { isAdmin, loading } = useAdmin();
  const [pushoverKey, setPushoverKey] = useState('');
  const [pushoverAppToken, setPushoverAppToken] = useState('');
  const [pushoverDevice, setPushoverDevice] = useState('');
  const [sending, setSending] = useState(false);

  const handleSendTestNotification = async () => {
    if (!pushoverKey.trim() || !pushoverAppToken.trim()) {
      toast.error('Enter a Pushover user key and app token first');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-pushover-notification', {
        body: {
          pushover_user_key: pushoverKey.trim(),
          pushover_app_token: pushoverAppToken.trim(),
          pushover_device: pushoverDevice.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Test notification sent!');
    } catch (error) {
      console.error('Error sending test notification:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage application settings and send test notifications</p>
          </div>
        </div>

        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Test Pushover Notification
            </CardTitle>
            <CardDescription>
              Send a one-off test push to any Pushover user key — useful for debugging a user's setup
              without touching their saved settings. Notifications themselves are configured per-user
              on the Profile page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pushoverKey">Pushover User Key</Label>
              <Input
                id="pushoverKey"
                value={pushoverKey}
                onChange={(e) => setPushoverKey(e.target.value)}
                placeholder="u1a2b3c4d5..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pushoverAppToken">Pushover App Token</Label>
              <Input
                id="pushoverAppToken"
                value={pushoverAppToken}
                onChange={(e) => setPushoverAppToken(e.target.value)}
                placeholder="a1z2y3x4w5..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pushoverDevice">Device (optional)</Label>
              <Input
                id="pushoverDevice"
                value={pushoverDevice}
                onChange={(e) => setPushoverDevice(e.target.value)}
                placeholder="e.g. iphone"
              />
            </div>

            <Button onClick={handleSendTestNotification} className="w-full" disabled={sending}>
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Sending...' : 'Send Test Notification'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

export interface Thread {
  id: string;
  accountId: string;
  content: string;
  mediaUrls?: string[];
  postedAt?: Date;
  threadsPostId?: string;
  status: 'pending' | 'posted' | 'error' | 'failed';
  errorMessage?: string;
  createdAt: Date;
}

export interface Account {
  id: string;
  username: string;
  email: string;
  threadsUserId?: string;
  status: 'active' | 'inactive' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyAnalytics {
  id: string;
  accountId: string;
  date: Date;
  followersCount: number;
  followersGained: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  engagementRate: number;
}

export interface BotConfig {
  accountId: string;
  postTimes: string[];
  commentCount: number;
  followCount: number;
  enableNotifications: boolean;
}
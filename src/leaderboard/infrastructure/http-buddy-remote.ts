import { BuddyRemote } from '@leaderboard/application/buddy-ports';
import { LeaderboardAnswer } from '@leaderboard/application/leaderboard-ports';
import { BuddyActivity } from '@leaderboard/domain/buddy-activity';
import { Language } from '@shared/domain/language';
import { done, request } from './http-leaderboard-remote';

/** Talks to the buddies routes, which live beside the leaderboard's and share its sign-in. */
export class HttpBuddyRemote extends BuddyRemote {
    override async follow(id: string): Promise<LeaderboardAnswer<void>> {
        return done(await request('PUT', `/follows/${encodeURIComponent(id)}`));
    }

    override async unfollow(id: string): Promise<LeaderboardAnswer<void>> {
        return done(await request('DELETE', `/follows/${encodeURIComponent(id)}`));
    }

    override async registerDevice(
        address: PushSubscriptionJSON,
        language: Language,
    ): Promise<LeaderboardAnswer<void>> {
        return done(await request('PUT', '/device', { subscription: address, language }));
    }

    override async forgetDevice(endpoint: string): Promise<LeaderboardAnswer<void>> {
        return done(await request('DELETE', '/device', { endpoint }));
    }

    override async report(activity: BuddyActivity): Promise<LeaderboardAnswer<void>> {
        return done(await request('POST', '/activity', activity));
    }
}

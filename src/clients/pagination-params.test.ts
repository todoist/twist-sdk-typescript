import { HttpResponse, http } from 'msw'
import { apiUrl } from '../testUtils/msw-handlers'
import { server } from '../testUtils/msw-setup'
import { TEST_API_TOKEN } from '../testUtils/test-defaults'
import { CommentsClient } from './comments-client'
import { ConversationMessagesClient } from './conversation-messages-client'
import { ConversationsClient } from './conversations-client'
import { ThreadsClient } from './threads-client'

/**
 * Wire-level tests: the documented Twist REST v3 paging parameters
 * (developer.twist.com/v3) must reach the server as snake_case query params.
 */
function captureQuery(path: string): { get: () => URLSearchParams } {
    let captured: URLSearchParams | undefined
    server.use(
        http.get(apiUrl(path), ({ request }) => {
            captured = new URL(request.url).searchParams
            return HttpResponse.json([])
        }),
    )
    return {
        get: () => {
            if (!captured) throw new Error(`no request captured for ${path}`)
            return captured
        },
    }
}

describe('documented pagination parameters', () => {
    const options = { apiToken: TEST_API_TOKEN }

    it('comments: forwards fromObjIndex, toObjIndex, orderBy and limit', async () => {
        const q = captureQuery('api/v3/comments/get')
        await new CommentsClient(options).getComments({
            threadId: 789,
            fromObjIndex: 500,
            toObjIndex: 999,
            orderBy: 'asc',
            limit: 500,
        })
        expect(q.get().get('thread_id')).toBe('789')
        expect(q.get().get('from_obj_index')).toBe('500')
        expect(q.get().get('to_obj_index')).toBe('999')
        expect(q.get().get('order_by')).toBe('asc')
        expect(q.get().get('limit')).toBe('500')
    })

    it('comments: sends fromObjIndex 0 (falsy) explicitly', async () => {
        const q = captureQuery('api/v3/comments/get')
        await new CommentsClient(options).getComments({ threadId: 1, fromObjIndex: 0 })
        expect(q.get().get('from_obj_index')).toBe('0')
    })

    it('comments: omits unset paging params (existing behaviour unchanged)', async () => {
        const q = captureQuery('api/v3/comments/get')
        await new CommentsClient(options).getComments({ threadId: 1 })
        expect(q.get().toString()).toBe('thread_id=1')
    })

    it('conversation messages: forwards fromObjIndex, toObjIndex, orderBy and keeps cursor', async () => {
        const q = captureQuery('api/v3/conversation_messages/get')
        await new ConversationMessagesClient(options).getMessages({
            conversationId: 456,
            fromObjIndex: 0,
            toObjIndex: 10,
            orderBy: 'desc',
            cursor: 'abc',
        })
        expect(q.get().get('conversation_id')).toBe('456')
        expect(q.get().get('from_obj_index')).toBe('0')
        expect(q.get().get('to_obj_index')).toBe('10')
        expect(q.get().get('order_by')).toBe('desc')
        expect(q.get().get('cursor')).toBe('abc')
    })

    it('threads: forwards beforeId, afterId and orderBy as snake_case', async () => {
        const q = captureQuery('api/v3/threads/get')
        await new ThreadsClient(options).getThreads({
            workspaceId: 1,
            channelId: 2,
            beforeId: 300,
            afterId: 100,
            orderBy: 'asc',
            limit: 500,
        })
        expect(q.get().get('channel_id')).toBe('2')
        expect(q.get().get('before_id')).toBe('300')
        expect(q.get().get('after_id')).toBe('100')
        expect(q.get().get('order_by')).toBe('asc')
        expect(q.get().get('limit')).toBe('500')
    })

    it('conversations: forwards limit, beforeId, afterId, orderBy, archived', async () => {
        const q = captureQuery('api/v3/conversations/get')
        await new ConversationsClient(options).getConversations({
            workspaceId: 1,
            archived: true,
            limit: 100,
            beforeId: 900,
            afterId: 5,
            orderBy: 'desc',
        })
        expect(q.get().get('workspace_id')).toBe('1')
        expect(q.get().get('archived')).toBe('true')
        expect(q.get().get('limit')).toBe('100')
        expect(q.get().get('before_id')).toBe('900')
        expect(q.get().get('after_id')).toBe('5')
        expect(q.get().get('order_by')).toBe('desc')
    })

    it('conversations: converts newerThan/olderThan Dates to Unix seconds', async () => {
        const q = captureQuery('api/v3/conversations/get')
        await new ConversationsClient(options).getConversations({
            workspaceId: 1,
            newerThan: new Date('2024-06-15T12:00:00Z'),
            olderThan: new Date('2024-06-16T12:00:00Z'),
        })
        expect(q.get().get('newer_than_ts')).toBe('1718452800')
        expect(q.get().get('older_than_ts')).toBe('1718539200')
        expect(q.get().get('newer_than')).toBeNull()
    })

    it('conversations batch descriptor carries the converted params', () => {
        const d = new ConversationsClient(options).getConversations(
            { workspaceId: 1, beforeId: 9, newerThan: new Date(1000_000) },
            { batch: true },
        )
        expect(d.params).toEqual({ workspaceId: 1, beforeId: 9, newer_than_ts: 1000 })
    })
})

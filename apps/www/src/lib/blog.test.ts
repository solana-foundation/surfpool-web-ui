import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import fs from 'fs';
import { getAllPosts, getPostBySlug, getAllTags, getPostsByTag } from './blog';

const mockFrontmatter = (title: string, date: string, tags: string[] = []) =>
  `---
title: ${title}
description: A test post
date: ${date}
author: Test Author
tags: [${tags.join(', ')}]
---

This is the post content for testing purposes.`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAllPosts', () => {
  it('returns empty array when blog directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(getAllPosts()).toEqual([]);
  });

  it('returns sorted posts when directory has MDX files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['post-a.mdx', 'post-b.mdx'] as any);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(mockFrontmatter('Post A', '2024-01-01'))
      .mockReturnValueOnce(mockFrontmatter('Post B', '2024-06-01'));

    const posts = getAllPosts();
    expect(posts).toHaveLength(2);
    // Should be sorted newest first
    expect(posts[0].title).toBe('Post B');
    expect(posts[1].title).toBe('Post A');
  });

  it('filters out non-MDX files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['post.mdx', 'readme.md', 'image.png'] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(mockFrontmatter('Post', '2024-01-01'));

    const posts = getAllPosts();
    expect(posts).toHaveLength(1);
  });
});

describe('getPostBySlug', () => {
  it('returns null for non-existent post', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(getPostBySlug('nonexistent')).toBeNull();
  });

  it('returns full post with content for existing slug', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockFrontmatter('My Post', '2024-03-15', ['solana', 'web3']));

    const post = getPostBySlug('my-post');
    expect(post).not.toBeNull();
    expect(post!.title).toBe('My Post');
    expect(post!.slug).toBe('my-post');
    expect(post!.tags).toEqual(['solana', 'web3']);
    expect(post!.content).toContain('post content for testing');
    expect(post!.readingTime).toBeTruthy();
  });
});

describe('getAllTags', () => {
  it('returns deduplicated sorted tags from all posts', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['post-a.mdx', 'post-b.mdx'] as any);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(mockFrontmatter('Post A', '2024-01-01', ['web3', 'solana']))
      .mockReturnValueOnce(mockFrontmatter('Post B', '2024-06-01', ['solana', 'defi']));

    const tags = getAllTags();
    expect(tags).toEqual(['defi', 'solana', 'web3']);
  });
});

describe('getPostsByTag', () => {
  it('returns only posts with the given tag', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['post-a.mdx', 'post-b.mdx'] as any);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(mockFrontmatter('Post A', '2024-01-01', ['web3']))
      .mockReturnValueOnce(mockFrontmatter('Post B', '2024-06-01', ['solana']));

    const posts = getPostsByTag('solana');
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('Post B');
  });
});

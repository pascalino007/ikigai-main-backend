import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Song } from './song.entity';
import { CreateSongDto, UpdateSongDto } from './dto/create-song.dto';

@Injectable()
export class SongsService {
  constructor(
    @InjectRepository(Song)
    private readonly songRepo: Repository<Song>,
  ) {}

  async findAll(): Promise<Song[]> {
    return this.songRepo.find({ order: { order: 'ASC', createdAt: 'DESC' } });
  }

  async findActive(): Promise<Song[]> {
    return this.songRepo.find({
      where: { isActive: true },
      order: { order: 'ASC', createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Song> {
    const song = await this.songRepo.findOne({ where: { id } });
    if (!song) throw new NotFoundException(`Song #${id} not found`);
    return song;
  }

  async create(
    dto: CreateSongDto,
    fileUrl: string,
    coverUrl?: string,
  ): Promise<Song> {
    const songData: DeepPartial<Song> = {
      ...dto,
      fileUrl,
      coverUrl: coverUrl ?? undefined,
    };
    const song = this.songRepo.create(songData);
    return this.songRepo.save(Array.isArray(song) ? song[0] : song);
  }

  async update(id: number, dto: UpdateSongDto): Promise<Song> {
    const song = await this.findOne(id);
    Object.assign(song, dto);
    return this.songRepo.save(song);
  }

  async remove(id: number): Promise<void> {
    const song = await this.findOne(id);
    await this.songRepo.remove(song);
  }
}

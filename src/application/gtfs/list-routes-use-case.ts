import { GtfsReadRepository, RouteSummaryDto } from './gtfs-read-repository.port';

export class ListRoutesUseCase {
  constructor(private readonly readRepository: GtfsReadRepository) {}

  public async execute(): Promise<RouteSummaryDto[]> {
    return await this.readRepository.findAllRoutes();
  }
}

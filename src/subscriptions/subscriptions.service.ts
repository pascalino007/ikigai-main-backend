import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './subscription.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly repo: Repository<Subscription>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
  ) {}

  async findAll(): Promise<Subscription[]> {
    return this.repo.find({ order: { created_at: 'DESC' } });
  }

  async findByUser(userId: number): Promise<Subscription | null> {
    return this.repo.findOne({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  async findByShop(shopId: number): Promise<Subscription | null> {
    return this.repo.findOne({
      where: { shop_id: shopId },
      order: { created_at: 'DESC' },
    });
  }

  async create(data: Partial<Subscription>): Promise<Subscription> {
    const sub = this.repo.create(data);
    return this.repo.save(sub);
  }

  async update(id: number, data: Partial<Subscription>): Promise<Subscription> {
    const sub = await this.repo.findOne({ where: { id } });
    if (!sub) throw new NotFoundException(`Subscription #${id} not found`);
    Object.assign(sub, data);
    return this.repo.save(sub);
  }

  async remove(id: number): Promise<void> {
    const sub = await this.repo.findOne({ where: { id } });
    if (!sub) throw new NotFoundException(`Subscription #${id} not found`);
    await this.repo.remove(sub);
  }

  async findAllPlans(): Promise<SubscriptionPlan[]> {
    return this.planRepo.find({
      order: { sort_order: 'ASC' },
    });
  }

  async findPlanByKey(key: string): Promise<SubscriptionPlan | null> {
    return this.planRepo.findOne({ where: { key, is_active: true } });
  }

  async createPlan(data: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
    const plan = this.planRepo.create(data);
    return this.planRepo.save(plan);
  }

  async updatePlan(id: number, data: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan #${id} not found`);
    Object.assign(plan, data);
    return this.planRepo.save(plan);
  }

  async removePlan(id: number): Promise<void> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan #${id} not found`);
    await this.planRepo.remove(plan);
  }

  async seedPlans(): Promise<void> {
    const existing = await this.planRepo.count();
    if (existing > 0) return;

    const plans: Partial<SubscriptionPlan>[] = [
      {
        key: 'basic',
        name: 'BASIC',
        subtitle: 'Démarrage',
        description: 'Idéal pour démarrer et gagner en visibilité.',
        monthly_price: 15000,
        yearly_price: 180000,
        currency: 'XOF',
        accent_color: '#6B7280',
        is_recommended: false,
        sort_order: 1,
        features_json: JSON.stringify([
          { category: 'Visibilité numérique', items: [
            'Création du profil professionnel',
            'Présentation du salon sur l\'application',
            'Affichage des services proposés',
            'Affichage des horaires',
            'Géolocalisation du salon',
          ]},
          { category: 'Réservations', items: [
            'Réception des demandes de rendez-vous',
            'Gestion du calendrier',
            'Notifications automatiques',
          ]},
          { category: 'Support', items: [
            'Assistance technique standard',
            'Accompagnement à l\'inscription',
          ]},
        ]),
      },
      {
        key: 'pro',
        name: 'PRO',
        subtitle: 'Croissance',
        description: 'Développez votre clientèle avec des outils avancés.',
        monthly_price: 35000,
        yearly_price: 420000,
        currency: 'XOF',
        accent_color: '#002D39',
        is_recommended: false,
        sort_order: 2,
        features_json: JSON.stringify([
          { category: 'Tout BASIC inclus', items: [] },
          { category: 'Visibilité renforcée', items: [
            'Positionnement prioritaire dans les résultats',
            'Badge « Partenaire Vérifié »',
            'Mise en avant dans les recommandations locales',
            'Présence dans les campagnes promotionnelles IKIGAI',
          ]},
          { category: 'Outils de croissance', items: [
            'Gestion avancée des rendez-vous',
            'Tableau de bord statistiques',
            'Historique clients',
          ]},
        ]),
      },
      {
        key: 'elite',
        name: 'ELITE',
        subtitle: 'Domination',
        description: 'La solution complète pour dominer votre marché.',
        monthly_price: 50000,
        yearly_price: 600000,
        currency: 'XOF',
        accent_color: '#D4A843',
        is_recommended: true,
        sort_order: 3,
        features_json: JSON.stringify([
          { category: 'Tout BASIC + PRO inclus', items: [] },
          { category: 'Application IKIGAI Partners', items: [
            'Gestion complète des rendez-vous',
            'Gestion des équipes et coiffeurs',
            'Gestion du planning',
            'Historique des clients',
            'Tableau de bord de performance',
            'Gestion des promotions',
          ]},
          { category: 'Programme IKIGAI Card', items: [
            'Attribution automatique des points',
            'Gestion des récompenses',
            'Accès aux campagnes fidélité',
          ]},
        ]),
      },
    ];

    for (const plan of plans) {
      const entity = this.planRepo.create(plan);
      await this.planRepo.save(entity);
    }
  }

  async findHistory(userId: number, shopId: number): Promise<Subscription[]> {
    const where: any[] = [];
    if (userId > 0) where.push({ user_id: userId });
    if (shopId > 0) where.push({ shop_id: shopId });
    if (where.length === 0) return [];
    return this.repo.find({
      where: where.length === 1 ? where[0] : where,
      order: { created_at: 'DESC' },
    });
  }
}

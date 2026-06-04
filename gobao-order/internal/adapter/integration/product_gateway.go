// Package integration 提供 Order 服务对外部依赖的接线适配实现。
// 当前主要承接 Product gRPC 和 Redis 幂等守卫，供 application 层通过抽象接口调用。
package integration

import (
	"context"
	"fmt"

	"github.com/yym108/gobao-order/internal/application"
	productv1 "github.com/yym108/gobao-proto/gen/go/gobao/product/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// ProductGateway 基于 Product gRPC 实现订单应用层所需的商品协作接口。
type ProductGateway struct {
	conn   *grpc.ClientConn               // Product gRPC 连接
	client productv1.ProductServiceClient // proto 生成的 Product client
}

// NewProductGateway 创建 Product gRPC 适配器。
func NewProductGateway(addr string) (*ProductGateway, error) {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("dial product: %w", err)
	}
	return &ProductGateway{
		conn:   conn,
		client: productv1.NewProductServiceClient(conn),
	}, nil
}

// Close 关闭底层 gRPC 连接。
func (g *ProductGateway) Close() error {
	return g.conn.Close()
}

// GetProductByID 按 product_id 查询后端权威商品快照。
// 当前订单只认独立商品本身，不再从商品详情里二次解析旧 SKU 列表。
func (g *ProductGateway) GetProductByID(ctx context.Context, productID int64) (*application.ProductView, error) {
	if productID <= 0 {
		return nil, nil
	}
	resp, err := g.client.GetProduct(ctx, &productv1.GetProductRequest{Id: productID})
	if err != nil {
		return nil, err
	}
	product := resp.GetProduct()
	if product == nil {
		return nil, nil
	}
	return &application.ProductView{
		ProductID:     product.GetId(),
		ProductName:   product.GetName(),
		ImageURL:      product.GetImageUrl(),
		SpecLabel:     product.GetSpecLabel(),
		Price:         product.GetPrice(),
		StockQuantity: product.GetStockQuantity(),
		Status:        product.GetStatus(),
	}, nil
}

// DeductStock 调用 Product 内部库存扣减 RPC。
func (g *ProductGateway) DeductStock(ctx context.Context, productID int64, quantity int32) error {
	_, err := g.client.DeductStock(ctx, &productv1.DeductStockRequest{
		ProductId: productID,
		Quantity:  quantity,
	})
	return err
}

// RestoreStock 调用 Product 内部库存回补 RPC。
func (g *ProductGateway) RestoreStock(ctx context.Context, productID int64, quantity int32) error {
	_, err := g.client.RestoreStock(ctx, &productv1.RestoreStockRequest{
		ProductId: productID,
		Quantity:  quantity,
	})
	return err
}

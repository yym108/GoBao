package grpc

import (
	"context"

	"github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/application"
	productv1 "github.com/yym108/gobao-proto/gen/go/gobao/product/v1"
)

// UploadMedia 上传一张媒体资源并保存元数据。
func (h *ProductHandler) UploadMedia(ctx context.Context, req *productv1.UploadMediaRequest) (*productv1.UploadMediaResponse, error) {
	if h.mediaAdminUC == nil {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeFailedPrecondition, "媒体后台能力未启用")).Err()
	}
	asset, err := h.mediaAdminUC.UploadMedia(ctx, application.UploadInput{
		Folder:       req.GetFolder(),
		OriginalName: req.GetFileName(),
		AltText:      req.GetAltText(),
		MIMEType:     req.GetMimeType(),
		Payload:      req.GetContent(),
	})
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.UploadMediaResponse{Media: mediaAssetToProto(asset)}, nil
}

// BindProductGroupMedia 绑定商品组媒体。
func (h *ProductHandler) BindProductGroupMedia(ctx context.Context, req *productv1.BindProductGroupMediaRequest) (*productv1.BindProductGroupMediaResponse, error) {
	if h.mediaAdminUC == nil {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeFailedPrecondition, "媒体后台能力未启用")).Err()
	}
	binding, err := h.mediaAdminUC.BindGroupMedia(ctx, req.GetGroupId(), req.GetMediaId(), req.GetUsageType(), req.GetSortOrder(), req.GetIsPrimary())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.BindProductGroupMediaResponse{Binding: productGroupMediaBindingToProto(binding)}, nil
}

// BindProductMedia 绑定独立商品媒体。
func (h *ProductHandler) BindProductMedia(ctx context.Context, req *productv1.BindProductMediaRequest) (*productv1.BindProductMediaResponse, error) {
	if h.mediaAdminUC == nil {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeFailedPrecondition, "媒体后台能力未启用")).Err()
	}
	binding, err := h.mediaAdminUC.BindProductMedia(ctx, req.GetProductId(), req.GetMediaId(), req.GetUsageType(), req.GetSortOrder(), req.GetIsPrimary())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.BindProductMediaResponse{Binding: productMediaBindingToProto(binding)}, nil
}

// UpdateProductGroupMediaBinding 更新商品组媒体绑定属性。
func (h *ProductHandler) UpdateProductGroupMediaBinding(ctx context.Context, req *productv1.UpdateProductGroupMediaBindingRequest) (*productv1.UpdateProductGroupMediaBindingResponse, error) {
	if h.mediaAdminUC == nil {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeFailedPrecondition, "媒体后台能力未启用")).Err()
	}
	binding, err := h.mediaAdminUC.UpdateGroupMediaBinding(ctx, req.GetGroupId(), req.GetBindingId(), req.GetUsageType(), req.GetSortOrder(), req.GetIsPrimary())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.UpdateProductGroupMediaBindingResponse{Binding: productGroupMediaBindingToProto(binding)}, nil
}

// UpdateProductMediaBinding 更新独立商品媒体绑定属性。
func (h *ProductHandler) UpdateProductMediaBinding(ctx context.Context, req *productv1.UpdateProductMediaBindingRequest) (*productv1.UpdateProductMediaBindingResponse, error) {
	if h.mediaAdminUC == nil {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeFailedPrecondition, "媒体后台能力未启用")).Err()
	}
	binding, err := h.mediaAdminUC.UpdateProductMediaBinding(ctx, req.GetProductId(), req.GetBindingId(), req.GetUsageType(), req.GetSortOrder(), req.GetIsPrimary())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.UpdateProductMediaBindingResponse{Binding: productMediaBindingToProto(binding)}, nil
}

// DeleteProductGroupMediaBinding 删除商品组媒体绑定。
func (h *ProductHandler) DeleteProductGroupMediaBinding(ctx context.Context, req *productv1.DeleteProductGroupMediaBindingRequest) (*productv1.DeleteProductGroupMediaBindingResponse, error) {
	if h.mediaAdminUC == nil {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeFailedPrecondition, "媒体后台能力未启用")).Err()
	}
	if err := h.mediaAdminUC.DeleteGroupMediaBinding(ctx, req.GetGroupId(), req.GetBindingId()); err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.DeleteProductGroupMediaBindingResponse{}, nil
}

// DeleteProductMediaBinding 删除独立商品媒体绑定。
func (h *ProductHandler) DeleteProductMediaBinding(ctx context.Context, req *productv1.DeleteProductMediaBindingRequest) (*productv1.DeleteProductMediaBindingResponse, error) {
	if h.mediaAdminUC == nil {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeFailedPrecondition, "媒体后台能力未启用")).Err()
	}
	if err := h.mediaAdminUC.DeleteProductMediaBinding(ctx, req.GetProductId(), req.GetBindingId()); err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.DeleteProductMediaBindingResponse{}, nil
}
